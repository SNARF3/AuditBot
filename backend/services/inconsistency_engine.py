import re
import asyncio
from typing import Optional, Callable
from sqlmodel import select
from models import Document, DocumentFragment
from sqlmodel.ext.asyncio.session import AsyncSession

# ─────────────────────────────────────────────────────────────────
# PASO 1 — Sanitización local
# ─────────────────────────────────────────────────────────────────
_METADATA_MARKERS_INTRA = [
    'carrera:', 'materia:', 'semestre:', 'integrantes:', 'docente:', 'universidad:',
]
_CARGO_PATTERN = re.compile(
    r'\b(CISO|Gerente|Jefe\s+de|Director|Analista|Supervisor|Coordinador|Subgerente)[\w\s]{0,20}',
    re.I,
)
_TYPE_MAP = {
    "plazo": "deadline",
    "conteo": "count",
    "referencia_inexistente": "reference",
    "procedimiento": "procedure",
    "responsable": "responsible",
}

# Grupos temáticos para agrupar fragmentos antes de enviar a Gemini
THEMATIC_GROUPS: dict[str, list[str]] = {
    "fechas_vigencia": ["vigencia", "fecha", "aprobado", "revisión", "enero", "diciembre"],
    "contraseñas":     ["90 días", "180 días", "contraseña", "vigencia máxima", "renovación"],
    "backup":          ["backup", "respaldo", "restauración", "prueba", "verificación"],
    "responsables":    ["ciso", "jefe", "gerente", "responsable", "reportar"],
    "continuidad":     ["rto", "rpo", "bcp", "recuperación", "horas"],
    "objetivos":       ["objetivo", "obj-", "estratégico"],
    "agencias":        ["agencia", "oficina", "regional", "nacional"],
}


def _groups_for_frag(text: str) -> set[str]:
    low = text.lower()
    return {name for name, kws in THEMATIC_GROUPS.items() if any(k in low for k in kws)}


def sanitize_fragment(text: str) -> Optional[str]:
    """Strip PII and return None if the fragment is metadata (portada/encabezado)."""
    text_lower = text.lower()
    if sum(1 for m in _METADATA_MARKERS_INTRA if m in text_lower) >= 2:
        return None
    result = re.sub(r'\b([A-ZÁÉÍÓÚ][a-záéíóú]+\s){2,4}', '[NOMBRE] ', text)
    result = _CARGO_PATTERN.sub('[CARGO]', result)
    result = re.sub(r'\b\d{7,}\b', '[ID]', result)
    result = re.sub(r'[\w.+-]+@[\w-]+\.[a-z]{2,}', '[EMAIL]', result)
    return result.strip()


async def analyze_document_inconsistencies(
    doc_id: int,
    entity_id: int,
    entity_name: str,
    session: AsyncSession,
    broadcast: Optional[Callable] = None,
) -> list[dict]:
    """3-step pipeline: (1) sanitize → (2) Gemini detects → (3) Ollama personalizes."""
    from services import gemini_service
    from services.ollama_service import personalize_description

    entity_id_str = str(entity_id)

    async def emit(step: int, message: str):
        if broadcast:
            await broadcast(entity_id_str, {
                "type": "inc_step",
                "doc_id": doc_id,
                "step": step,
                "message": message,
            })

    # ── Step 1: sanitize ────────────────────────────────────────────
    await emit(1, "Sanitizando fragmentos...")

    doc_result = await session.exec(
        select(Document).where(Document.id == doc_id, Document.entity_id == entity_id)
    )
    doc = doc_result.first()
    if not doc or doc.status != "ready":
        return []

    frags_result = await session.exec(
        select(DocumentFragment).where(DocumentFragment.document_id == doc_id)
    )
    all_frags = sorted(frags_result.all(), key=lambda f: f.id)

    clean_pairs: list[tuple] = []
    for f in all_frags:
        s = sanitize_fragment(f.content or "")
        if s and len(s) > 30:
            clean_pairs.append((f, s))

    if len(clean_pairs) < 2:
        await emit(1, "Muy pocos fragmentos con contenido relevante.")
        return []

    # ── Step 2: Gemini — una llamada por grupo temático ─────────────
    # Construir índice: grupo → lista de (frag, sanitized_text)
    group_idx: dict[str, list[tuple]] = {}
    for frag, s in clean_pairs:
        for grp in _groups_for_frag(s):
            group_idx.setdefault(grp, []).append((frag, s))

    # Batches: grupos con ≥2 fragmentos, máximo 4 frags por batch
    batches: list[tuple[str, list[tuple]]] = []
    for grp, members in group_idx.items():
        if len(members) >= 2:
            batches.append((grp, members[:4]))

    if not batches:
        # fallback: mandar los primeros 4 fragmentos juntos sin filtro temático
        batches = [("general", clean_pairs[:4])]

    _GEMINI_PROMPT_TMPL = (
        "Eres auditor de TI especializado en banca. "
        "Analiza estos fragmentos del mismo documento (tema: {group}) y detecta "
        "inconsistencias internas reales: plazos que se contradicen, conteos que no "
        "coinciden, referencias a secciones o anexos inexistentes, procedimientos "
        "contradictorios, responsables distintos para la misma tarea.\n\n"
        "FRAGMENTOS:\n{frags_text}"
        'Responde SOLO en JSON sin markdown:\n'
        '{{"inconsistencies": [{{"fragment_a_index": 0, "fragment_b_index": 1, '
        '"type": "plazo|conteo|referencia_inexistente|procedimiento|responsable", '
        '"description": "descripción clara y concisa en español", '
        '"severity": "alta|media|baja"}}]}}\n\n'
        'Si no hay inconsistencias reales responde: {{"inconsistencies": []}}\n'
        'Solo contradicciones directas — no diferencias de contexto.'
    )

    raw_items_by_batch: list[tuple[list[tuple], list[dict]]] = []
    total_found = 0

    for grp, members in batches:
        await emit(2, f"Gemini: analizando grupo '{grp}' ({len(members)} fragmentos)...")
        frags_text = "".join(f"[{i}] {s[:500]}\n\n" for i, (_, s) in enumerate(members))
        prompt = _GEMINI_PROMPT_TMPL.format(group=grp, frags_text=frags_text)

        # Llamar con gemma; si da 429 esperar y reintentar una vez
        model_used = "gemma-4-27b-it"
        result = await gemini_service._call_gemini(prompt, model_used)
        if result.get("error", "").startswith("Gemini error 429"):
            await asyncio.sleep(5)
            result = await gemini_service._call_gemini(prompt, model_used)
        await gemini_service._log_usage(
            entity_id, f"doc_inc_{grp}", model_used,
            result.get("tokens_in", 0), result.get("tokens_out", 0),
        )
        if "error" in result:
            await emit(2, f"⚠️ Gemini error en '{grp}': {result['error']}")
            continue

        parsed = gemini_service._extract_json(result["text"])
        items = (parsed or {}).get("inconsistencies", [])
        if items:
            raw_items_by_batch.append((members, items))
            total_found += len(items)

    await emit(2, f"Gemini: {total_found} inconsistencia{'s' if total_found != 1 else ''} encontrada{'s' if total_found != 1 else ''} ✓")

    if not raw_items_by_batch:
        return []

    # ── Step 3: Ollama — personaliza cada descripción ────────────────
    await emit(3, "Ollama: personalizando...")

    doc_name = doc.original_name or doc.filename
    results = []
    seen_pairs: set[tuple[int, int]] = set()
    ollama_error: Optional[str] = None

    for members, items in raw_items_by_batch:
        for item in items:
            desc = item.get("description", "")
            if not desc:
                continue

            idx_a = max(0, min(item.get("fragment_a_index", 0), len(members) - 1))
            idx_b = max(0, min(item.get("fragment_b_index", min(1, len(members) - 1)), len(members) - 1))
            frag_a, _ = members[idx_a]
            frag_b, _ = members[idx_b]

            # Deduplicar: misma pareja reportada por varios grupos
            pair_key = (min(frag_a.id, frag_b.id), max(frag_a.id, frag_b.id))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)

            formal: Optional[str] = None
            if not ollama_error:
                ollama_result = await personalize_description(desc, entity_name)
                if "error" in ollama_result:
                    ollama_error = ollama_result["error"]
                else:
                    formal = ollama_result["text"]

            inc_type = _TYPE_MAP.get(item.get("type", ""), item.get("type", "deadline"))

            results.append({
                "entity_id": entity_id,
                "doc_a_id": doc_id, "doc_b_id": doc_id,
                "doc_a_name": doc_name, "doc_b_name": doc_name,
                "fragment_a_id": frag_a.id,
                "fragment_b_id": frag_b.id,
                "fragment_a_text": (frag_a.content or "")[:400],
                "fragment_b_text": (frag_b.content or "")[:400],
                "inc_type": inc_type,
                "severity": item.get("severity", "media"),
                "description": desc,
                "gemini_description": desc,
                "formal_description": formal,
            })

    if ollama_error:
        await emit(3, f"⚠️ {ollama_error}")
    else:
        await emit(3, "Ollama: listo ✓")

    return results

# ─────────────────────────────────────────────────────────────────
# RULE 1 — Thematic groups
# A pair is only formed if both fragments share at least one theme.
# ─────────────────────────────────────────────────────────────────
THEMES: dict[str, list[str]] = {
    "contraseñas":  ["contraseña", "password", "credencial", "vigencia", "días", "caracteres", "bloqueo"],
    "backup":       ["backup", "respaldo", "restauración", "recuperación", "retención", "copia"],
    "incidentes":   ["incidente", "respuesta", "tiempo", "horas", "responsable", "ciso", "escalamiento"],
    "continuidad":  ["rto", "rpo", "bcp", "recuperación", "horas", "continuidad"],
    "responsables": ["responsable", "ciso", "gerente", "jefe", "área", "cargo"],
    "agencias":     ["agencia", "oficina", "sucursal", "regional", "nacional"],
    "objetivos":    ["objetivo", "obj", "estratégico", "meta"],
}

# ─────────────────────────────────────────────────────────────────
# RULE 2 — Metadata markers: cover pages and admin headers
# Count-based: >= 2 markers in the text → discard as metadata
# ─────────────────────────────────────────────────────────────────
METADATA_MARKERS = [
    'carrera:', 'materia:', 'semestre:', 'integrantes:',
    'docente:', 'fecha:', 'universidad:', 'ingeniería de',
]

# ─────────────────────────────────────────────────────────────────
# Extraction patterns used by _check_pair and RULE 3
# ─────────────────────────────────────────────────────────────────
RE_DATE = re.compile(
    r'\b(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}[/\-]\d{2}[/\-]\d{2}|'
    r'\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|'
    r'septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?\d{4})\b',
    re.I,
)
RE_DEADLINE = re.compile(
    r'\b(\d+)\s*(días?\s*(?:hábiles?|naturales?)?|horas?|meses?|semanas?)\b', re.I
)
RE_RESPONSIBLE = re.compile(
    r'\b(Gerente|Director|Jefe|Responsable|Encargado|Administrador|CIO|CEO|CISO|CSO)'
    r'\s+(?:de\s+)?([A-ZÁÉÍÓÚ][a-záéíóúñ\s]{3,30})',
    re.I,
)
RE_FIGURE = re.compile(
    r'(?:\$\s*[\d,]+(?:\.\d+)?|\b\d+(?:[.,]\d+)?\s*%|\b\d[\d,.]+\s*(?:millones?|mil|USD|MXN|pesos?))',
    re.I,
)
RE_CROSSREF = re.compile(
    r'\b(?:ver|véase|según|conforme|de acuerdo)\s+'
    r'(?:la?\s+)?(?:sección|apartado|punto|capítulo|anexo|apéndice)\s+[\w.]+\b'
    r'|\b(?:anexo|apéndice|sección|capítulo)\s+[A-Z\d.]+\b',
    re.I,
)
RE_COUNT = re.compile(
    r'\blos?\s+(\d+)\s+(?:objetivos?|procesos?|controles?|criterios?|requisitos?'
    r'|responsables?|políticas?|procedimientos?|lineamientos?|principios?)\b',
    re.I,
)

NEG_WORDS = ["no se", "no existe", "no cuenta", "no tiene", "carece", "no hay",
             "ausente", "sin evidencia", "no dispone", "no posee"]
POS_WORDS = ["sí existe", "existe", "cuenta con", "tiene implementado", "implementado",
             "establecido", "documentado", "aprobado", "vigente", "en operación"]


# ─────────────────────────────────────────────────────────────────
# Core classification helpers
# ─────────────────────────────────────────────────────────────────

def _themes_for(text: str) -> set[str]:
    low = text.lower()
    return {name for name, kws in THEMES.items() if any(k in low for k in kws)}


def _shared_themes(text_a: str, text_b: str) -> set[str]:
    return _themes_for(text_a) & _themes_for(text_b)


def _is_metadata(text: str) -> bool:
    """True when >= 2 cover-page / admin-header markers are found anywhere in the text."""
    text_lower = text.lower()
    matches = sum(1 for marker in METADATA_MARKERS if marker in text_lower)
    return matches >= 2


def _is_substantive_intra(text: str) -> bool:
    """RULE 3: intra-doc fragment must have a thematic keyword AND a numeric/role signal."""
    if not _themes_for(text):
        return False
    return bool(
        RE_DEADLINE.search(text)
        or RE_RESPONSIBLE.search(text)
        or RE_COUNT.search(text)
        or RE_DATE.search(text)
        or RE_CROSSREF.search(text)
    )


def _intra_type_from(description: str) -> str:
    low = description.lower()
    if any(w in low for w in ["referencia", "anexo", "sección", "apéndice", "no existe", "inexistente"]):
        return "reference"
    if any(w in low for w in ["conteo", "cantidad", "número de", "objetivo", "criterio", "proceso"]):
        return "count"
    if any(w in low for w in ["responsable", "gerente", "director", "jefe", "encargado", "ciso"]):
        return "responsible"
    if any(w in low for w in ["fecha", "vigencia", "vencimiento"]):
        return "date"
    if any(w in low for w in ["plazo", "días", "horas", "meses"]):
        return "deadline"
    return "reference"


# ─────────────────────────────────────────────────────────────────
# Deterministic contradiction checker
# ─────────────────────────────────────────────────────────────────

def _dates(text: str) -> list:
    return [m.group(0).strip() for m in RE_DATE.finditer(text)]


def _deadlines(text: str) -> list:
    out = []
    for m in RE_DEADLINE.finditer(text):
        try:
            out.append((int(m.group(1)), m.group(2).lower().strip()))
        except Exception:
            pass
    return out


def _responsibles(text: str) -> list:
    return [m.group(0).lower() for m in RE_RESPONSIBLE.finditer(text)]


def _figures(text: str) -> list:
    return [m.group(0) for m in RE_FIGURE.finditer(text)]


def _deadline_days(val: int, unit: str) -> float:
    if "hora" in unit:
        return val / 24
    if "semana" in unit:
        return val * 7
    if "mes" in unit:
        return val * 30
    return float(val)


def _check_pair(text_a: str, text_b: str) -> Optional[dict]:
    # RULE 1 gate — themes must overlap before any further work
    if not _shared_themes(text_a, text_b):
        return None

    da, db = _dates(text_a), _dates(text_b)
    if da and db and set(da) != set(db) and (set(da) - set(db)):
        return {"type": "date", "severity": "alta",
                "description": f"Fechas inconsistentes: {da[0]} vs {db[0]}"}

    dla, dlb = _deadlines(text_a), _deadlines(text_b)
    if dla and dlb:
        for v_a, u_a in dla:
            for v_b, u_b in dlb:
                d_a = _deadline_days(v_a, u_a)
                d_b = _deadline_days(v_b, u_b)
                diff = abs(d_a - d_b)
                if d_a != d_b and diff > max(d_a, d_b) * 0.25 and diff > 1:
                    return {"type": "deadline", "severity": "media",
                            "description": f"Plazos inconsistentes: {v_a} {u_a} vs {v_b} {u_b}"}

    ra_list, rb_list = _responsibles(text_a), _responsibles(text_b)
    for ra in ra_list:
        for rb in rb_list:
            if ra.split()[0] == rb.split()[0] and ra != rb:
                return {"type": "responsible", "severity": "media",
                        "description": f"Responsables inconsistentes: '{ra}' vs '{rb}'"}

    fa_list, fb_list = _figures(text_a), _figures(text_b)
    if fa_list and fb_list and set(fa_list) != set(fb_list):
        return {"type": "figure", "severity": "media",
                "description": f"Cifras inconsistentes: {fa_list[0]} vs {fb_list[0]}"}

    neg_a = any(w in text_a.lower() for w in NEG_WORDS)
    pos_a = any(w in text_a.lower() for w in POS_WORDS)
    neg_b = any(w in text_b.lower() for w in NEG_WORDS)
    pos_b = any(w in text_b.lower() for w in POS_WORDS)
    if (neg_a and pos_b) or (neg_b and pos_a):
        return {"type": "ambiguous", "severity": "baja",
                "description": "Posible contradicción entre presencia/ausencia del control"}

    return None


# ─────────────────────────────────────────────────────────────────
# INTRA-DOCUMENT — Gemini
# ─────────────────────────────────────────────────────────────────

async def scan_intra_document(doc_id: int, entity_id: int, session: AsyncSession) -> list[dict]:
    from services import gemini_service

    doc_result = await session.exec(
        select(Document).where(Document.id == doc_id, Document.entity_id == entity_id)
    )
    doc = doc_result.first()
    if not doc or doc.status != "ready":
        return []

    frags_result = await session.exec(
        select(DocumentFragment).where(DocumentFragment.document_id == doc_id)
    )
    all_frags = sorted(frags_result.all(), key=lambda f: f.id)

    # RULE 2 + RULE 3: drop metadata; keep only fragments with theme + numeric/role signal
    candidates = [
        f for f in all_frags
        if not _is_metadata(f.content or "") and _is_substantive_intra(f.content or "")
    ]

    if len(candidates) < 2:
        return []

    # RULE 1: group by theme, build same-theme batches for Gemini
    by_theme: dict[str, list] = {}
    for f in candidates:
        for theme in _themes_for(f.content or ""):
            by_theme.setdefault(theme, []).append(f)

    batches = []
    seen_keys: set = set()
    for frags in by_theme.values():
        if len(frags) < 2:
            continue
        for i in range(0, len(frags) - 1, 2):
            batch = frags[i: i + 3]
            if len(batch) < 2:
                continue
            key = tuple(sorted(f.id for f in batch))
            if key in seen_keys:
                continue
            seen_keys.add(key)
            batches.append(batch)
            if len(batches) >= 6:
                break
        if len(batches) >= 6:
            break

    doc_name = doc.original_name or doc.filename
    results = []

    for batch in batches:
        frags_for_gemini = [{"id": f.id, "text": (f.content or "")[:300]} for f in batch]
        analysis = await gemini_service.detect_intra_inconsistencies(entity_id, frags_for_gemini)
        if "error" in analysis:
            continue

        for item in analysis.get("inconsistencies", []):
            if not item.get("description"):
                continue
            fa_text = (item.get("fragment_a") or batch[0].content or "")[:400]
            fb_text = (item.get("fragment_b") or (batch[1].content if len(batch) > 1 else batch[0].content) or "")[:400]
            results.append({
                "entity_id": entity_id,
                "doc_a_id": doc_id, "doc_b_id": doc_id,
                "doc_a_name": doc_name, "doc_b_name": doc_name,
                "fragment_a_id": batch[0].id,
                "fragment_b_id": batch[1].id if len(batch) > 1 else batch[0].id,
                "fragment_a_text": fa_text,
                "fragment_b_text": fb_text,
                "inc_type": _intra_type_from(item["description"]),
                "severity": item.get("severity", "media"),
                "description": item["description"],
                "status": "detected",
            })

    return results


# ─────────────────────────────────────────────────────────────────
# INTRA-DOCUMENT — Engine (deterministic)
# ─────────────────────────────────────────────────────────────────

async def scan_intra_document_engine(doc_id: int, entity_id: int, session: AsyncSession) -> list[dict]:
    doc_result = await session.exec(
        select(Document).where(Document.id == doc_id, Document.entity_id == entity_id)
    )
    doc = doc_result.first()
    if not doc or doc.status != "ready":
        return []

    frags_result = await session.exec(
        select(DocumentFragment).where(DocumentFragment.document_id == doc_id)
    )
    all_frags = sorted(frags_result.all(), key=lambda f: f.id)

    # RULE 2 + RULE 3
    substantive = [
        f for f in all_frags
        if not _is_metadata(f.content or "") and _is_substantive_intra(f.content or "")
    ]

    if len(substantive) < 2:
        return []

    doc_name = doc.original_name or doc.filename
    results = []
    seen: set = set()

    for i, fa in enumerate(substantive):
        for fb in substantive[i + 1:]:
            key = (fa.id, fb.id)
            if key in seen:
                continue
            text_a = (fa.content or "").strip()
            text_b = (fb.content or "").strip()
            # RULE 1: shared theme check is inside _check_pair
            seen.add(key)
            contradiction = _check_pair(text_a, text_b)
            if not contradiction:
                continue
            results.append({
                "entity_id": entity_id,
                "doc_a_id": doc_id, "doc_b_id": doc_id,
                "doc_a_name": doc_name, "doc_b_name": doc_name,
                "fragment_a_id": fa.id,
                "fragment_b_id": fb.id,
                "fragment_a_text": text_a[:400],
                "fragment_b_text": text_b[:400],
                "inc_type": contradiction["type"],
                "severity": contradiction["severity"],
                "description": contradiction["description"],
                "status": "detected",
            })
            if len(results) >= 50:
                return results

    return results


# ─────────────────────────────────────────────────────────────────
# INTER-DOCUMENT — Engine (deterministic)
# ─────────────────────────────────────────────────────────────────

async def scan_inconsistencies(entity_id: int, session: AsyncSession) -> list[dict]:
    docs_result = await session.exec(
        select(Document).where(Document.entity_id == entity_id, Document.status == "ready")
    )
    docs = list(docs_result.all())
    if len(docs) < 2:
        return []

    doc_map = {d.id: d for d in docs}
    doc_ids = set(doc_map.keys())

    frags_result = await session.exec(
        select(DocumentFragment).where(DocumentFragment.entity_id == entity_id)
    )
    # RULE 2: strip metadata up front
    clean_frags = [
        f for f in frags_result.all()
        if f.document_id in doc_ids and not _is_metadata(f.content or "")
    ]

    # RULE 1: index by theme — only fragments with at least one theme enter the index
    theme_idx: dict[str, list] = {}
    for f in clean_frags:
        for theme in _themes_for(f.content or ""):
            theme_idx.setdefault(theme, []).append((f.document_id, f))

    # Collect cross-doc pairs that share a theme (cap 500)
    seen: set = set()
    candidates: list = []
    for items in theme_idx.values():
        for i, (did_a, fa) in enumerate(items):
            for did_b, fb in items[i + 1:]:
                if did_a == did_b:
                    continue
                key = (min(fa.id, fb.id), max(fa.id, fb.id))
                if key in seen:
                    continue
                seen.add(key)
                candidates.append((did_a, fa, did_b, fb))
                if len(candidates) >= 500:
                    break
            if len(candidates) >= 500:
                break
        if len(candidates) >= 500:
            break

    results = []
    for did_a, fa, did_b, fb in candidates:
        text_a = (fa.content or "").strip()
        text_b = (fb.content or "").strip()
        if len(text_a) < 30 or len(text_b) < 30:
            continue
        contradiction = _check_pair(text_a, text_b)
        if not contradiction:
            continue
        doc_a = doc_map[did_a]
        doc_b = doc_map[did_b]
        results.append({
            "entity_id": entity_id,
            "doc_a_id": did_a, "doc_b_id": did_b,
            "doc_a_name": doc_a.original_name or doc_a.filename,
            "doc_b_name": doc_b.original_name or doc_b.filename,
            "fragment_a_id": fa.id,
            "fragment_b_id": fb.id,
            "fragment_a_text": text_a[:400],
            "fragment_b_text": text_b[:400],
            "inc_type": contradiction["type"],
            "severity": contradiction["severity"],
            "description": contradiction["description"],
            "status": "detected",
        })

    return results


# ─────────────────────────────────────────────────────────────────
# INTER-DOCUMENT — Gemini
# ─────────────────────────────────────────────────────────────────

async def scan_inter_gemini(entity_id: int, session: AsyncSession) -> list[dict]:
    from services import gemini_service

    docs_result = await session.exec(
        select(Document).where(Document.entity_id == entity_id, Document.status == "ready")
    )
    docs = list(docs_result.all())
    if len(docs) < 2:
        return []

    doc_map = {d.id: d for d in docs}
    doc_ids = set(doc_map.keys())

    frags_result = await session.exec(
        select(DocumentFragment).where(DocumentFragment.entity_id == entity_id)
    )
    # RULE 2: strip metadata
    clean_frags = [
        f for f in frags_result.all()
        if f.document_id in doc_ids and not _is_metadata(f.content or "")
    ]

    # RULE 1: index by theme
    theme_idx: dict[str, list] = {}
    for f in clean_frags:
        for theme in _themes_for(f.content or ""):
            theme_idx.setdefault(theme, []).append((f.document_id, f))

    # Group cross-doc pairs by (theme, doc_pair) — capped at 8 Gemini calls
    seen: set = set()
    by_theme_docpair: dict = {}
    total = 0
    for theme, items in theme_idx.items():
        for i, (did_a, fa) in enumerate(items):
            for did_b, fb in items[i + 1:]:
                if did_a == did_b:
                    continue
                key = (min(fa.id, fb.id), max(fa.id, fb.id))
                if key in seen:
                    continue
                seen.add(key)
                pair_key = (theme, min(did_a, did_b), max(did_a, did_b))
                by_theme_docpair.setdefault(pair_key, []).append((did_a, fa, did_b, fb))
                total += 1
                if total >= 60:
                    break
            if total >= 60:
                break
        if total >= 60:
            break

    results = []
    for call_idx, ((theme, da_id, db_id), pairs) in enumerate(by_theme_docpair.items()):
        if call_idx >= 8:
            break
        doc_a = doc_map[da_id]
        doc_b = doc_map[db_id]
        batch = pairs[:3]

        frags_labeled = []
        for did_a, fa, did_b, fb in batch:
            d_a = doc_map[did_a]
            d_b = doc_map[did_b]
            frags_labeled.append({"id": fa.id, "text": (fa.content or "")[:300],
                                   "doc": d_a.original_name or d_a.filename})
            frags_labeled.append({"id": fb.id, "text": (fb.content or "")[:300],
                                   "doc": d_b.original_name or d_b.filename})

        analysis = await gemini_service.detect_inter_inconsistencies(entity_id, frags_labeled)
        if "error" in analysis:
            continue

        fa_ref = batch[0][1]
        fb_ref = batch[0][3]
        for item in analysis.get("inconsistencies", []):
            if not item.get("description"):
                continue
            results.append({
                "entity_id": entity_id,
                "doc_a_id": da_id, "doc_b_id": db_id,
                "doc_a_name": doc_a.original_name or doc_a.filename,
                "doc_b_name": doc_b.original_name or doc_b.filename,
                "fragment_a_id": fa_ref.id,
                "fragment_b_id": fb_ref.id,
                "fragment_a_text": (item.get("fragment_a") or fa_ref.content or "")[:400],
                "fragment_b_text": (item.get("fragment_b") or fb_ref.content or "")[:400],
                "inc_type": _intra_type_from(item["description"]),
                "severity": item.get("severity", "media"),
                "description": item["description"],
                "status": "detected",
            })

    return results
