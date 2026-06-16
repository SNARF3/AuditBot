import httpx
import json
import re
import asyncio
from datetime import datetime, date
from sqlmodel import select
from models import GeminiUsage, SystemConfig
from database import AsyncSessionLocal

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
DAILY_LIMIT = 200
RPM_LIMIT = 8


async def _get_api_key() -> str | None:
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(SystemConfig).where(SystemConfig.key == "gemini_api_key")
        )
        cfg = result.first()
        return cfg.value if cfg else None


async def _check_quota() -> tuple[bool, int]:
    async with AsyncSessionLocal() as session:
        today = date.today().isoformat()
        result = await session.exec(
            select(GeminiUsage).where(GeminiUsage.created_at >= today)
        )
        all_today = result.all()
        count = len(all_today)
        if count >= DAILY_LIMIT:
            return False, count

        minute_ago = datetime.utcnow().timestamp() - 60
        recent = [u for u in all_today if u.created_at.timestamp() > minute_ago]
        if len(recent) >= RPM_LIMIT:
            await asyncio.sleep(12)

        return True, count


async def _log_usage(entity_id, operation, model, tokens_in=0, tokens_out=0):
    async with AsyncSessionLocal() as session:
        usage = GeminiUsage(
            entity_id=entity_id,
            operation=operation,
            model=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        )
        session.add(usage)
        await session.commit()


async def _call_gemini(prompt: str, model: str = "gemini-2.5-flash-lite", max_tokens: int = 8192) -> dict:
    api_key = await _get_api_key()
    if not api_key:
        return {"error": "API key no configurada"}

    url = f"{GEMINI_BASE}/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": max_tokens},
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(url, json=payload)
        if r.status_code != 200:
            return {"error": f"Gemini error {r.status_code}: {r.text[:200]}"}

        data = r.json()
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            tokens_in = data.get("usageMetadata", {}).get("promptTokenCount", 0)
            tokens_out = data.get("usageMetadata", {}).get("candidatesTokenCount", 0)
            return {"text": text, "tokens_in": tokens_in, "tokens_out": tokens_out}
        except (KeyError, IndexError):
            return {"error": "Respuesta inesperada de Gemini", "raw": str(data)[:300]}


def _extract_json(text: str) -> dict | None:
    if not text:
        return None

    raw = text.strip()

    # 1. Direct parse
    try:
        return json.loads(raw)
    except Exception:
        pass

    # 2. Strip ```json ... ``` or ``` ... ``` fences
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', raw)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except Exception:
            pass

    # 3. Extract outermost { } or [ ] block
    for open_c, close_c in [('{', '}'), ('[', ']')]:
        start = raw.find(open_c)
        end   = raw.rfind(close_c)
        if start != -1 and end > start:
            try:
                return json.loads(raw[start:end + 1])
            except Exception:
                pass

    return None


async def analyze_process(entity_id: int, process_id: str, process_name: str, entity_name: str, fragments: list[dict]) -> dict:
    ok, count = await _check_quota()
    if not ok:
        return {"error": "Cuota diaria de Gemini agotada", "quota_used": count}

    frag_text = "\n".join(
        f"[{f.get('page_ref', 'p?')}] {f['content'][:300]}"
        for f in fragments[:8]
    )[:2000]

    prompt = f"""Eres un auditor de TI experto en COBIT 4.1. Analiza la cobertura del proceso {process_id} ({process_name}) para la entidad "{entity_name}".

FRAGMENTOS RELEVANTES DE DOCUMENTOS:
{frag_text if frag_text else "No se encontraron fragmentos relevantes."}

Responde SOLO en JSON válido (sin markdown):
{{"status": "compliant|partial|gap|no_data", "confidence": 0.0-1.0, "key_evidence": "fragmento más importante (máx 100 chars)", "gaps": ["gap específico 1"], "recommendations": ["acción concreta 1"]}}"""

    result = await _call_gemini(prompt, "gemini-2.5-flash-lite")
    await _log_usage(entity_id, "analyze_process", "gemini-2.5-flash-lite",
                     result.get("tokens_in", 0), result.get("tokens_out", 0))

    if "error" in result:
        return result

    parsed = _extract_json(result["text"])
    if parsed:
        parsed["tokens_used"] = result.get("tokens_out", 0)
        return parsed
    return {"raw_response": result["text"], "tokens_used": result.get("tokens_out", 0)}


async def draft_finding(entity_id: int, process_id: str, process_name: str, gap_description: str, evidence: str) -> dict:
    ok, count = await _check_quota()
    if not ok:
        return {"error": "Cuota diaria de Gemini agotada"}

    prompt = f"""Redacta una observación formal de auditoría de TI (COBIT 4.1).

PROCESO: {process_id} - {process_name}
GAP: {gap_description}
EVIDENCIA: {evidence[:300]}

Responde SOLO en JSON válido (sin markdown):
{{"titulo": "...", "condicion": "qué se encontró (máx 60 palabras)", "criterio": "qué exige COBIT (máx 40 palabras)", "causa": "por qué existe el gap (máx 40 palabras)", "efecto": "riesgo potencial (máx 40 palabras)", "recomendacion": "acción concreta (máx 50 palabras)"}}"""

    result = await _call_gemini(prompt, "gemini-2.5-flash-lite")
    await _log_usage(entity_id, "draft_finding", "gemini-2.5-flash-lite",
                     result.get("tokens_in", 0), result.get("tokens_out", 0))

    if "error" in result:
        return result

    parsed = _extract_json(result["text"])
    return parsed or {"raw": result["text"]}


async def explain_process(entity_id: int, process_id: str, process_name: str, entity_industry: str) -> dict:
    ok, count = await _check_quota()
    if not ok:
        return {"error": "Cuota diaria de Gemini agotada"}

    prompt = f"""Explica el proceso COBIT 4.1 {process_id} ({process_name}) a un auditor de TI.
Contexto: organización del sector {entity_industry}.
Responde en máx 120 palabras, lenguaje claro. Incluye: qué evalúa, qué evidencia buscar, ejemplo para {entity_industry}.
Solo texto plano, sin formato especial."""

    result = await _call_gemini(prompt, "gemini-2.5-flash-lite")
    await _log_usage(entity_id, "explain", "gemini-2.5-flash-lite",
                     result.get("tokens_in", 0), result.get("tokens_out", 0))

    if "error" in result:
        return result
    return {"explanation": result["text"]}


async def copilot_chat(entity_id: int, message: str, context: dict, history: list[dict]) -> dict:
    ok, count = await _check_quota()
    if not ok:
        return {"error": "Cuota diaria agotada", "quota_used": count}

    context_str = f"""Entidad: {context.get('name', '?')} ({context.get('industry', '?')})
Gaps principales: {', '.join(context.get('top_gaps', [])[:5]) or 'ninguno identificado aún'}
Hallazgos validados: {context.get('validated_findings', 0)}"""

    history_str = ""
    for turn in history[-6:]:
        role = "Auditor" if turn["role"] == "user" else "Asistente"
        history_str += f"{role}: {turn['content'][:200]}\n"

    prompt = f"""Eres un asistente de auditoría de TI especializado en COBIT 4.1.
CONTEXTO DE LA AUDITORÍA:
{context_str}

HISTORIAL RECIENTE:
{history_str}
Auditor: {message}

Responde de forma concisa (máx 150 palabras). Eres un apoyo para el auditor, no tomas decisiones por él."""

    result = await _call_gemini(prompt, "gemini-2.5-flash-lite")
    await _log_usage(entity_id, "copilot", "gemini-2.5-flash-lite",
                     result.get("tokens_in", 0), result.get("tokens_out", 0))

    if "error" in result:
        return result
    return {"response": result["text"], "quota_after": count + 1}


async def prioritize_gaps(entity_id: int, entity_name: str, entity_industry: str, gaps: list[dict]) -> dict:
    ok, count = await _check_quota()
    if not ok:
        return {"error": "Cuota diaria agotada"}

    gaps_json = json.dumps(gaps[:10], ensure_ascii=False)
    prompt = f"""Prioriza estos gaps de auditoría TI para {entity_name} ({entity_industry}):
{gaps_json}

Ordena del más al menos crítico según riesgo real para {entity_industry}.
Responde SOLO en JSON:
[{{"process_id": "XX", "rank": 1, "reason": "máx 50 chars"}}]"""

    result = await _call_gemini(prompt, "gemini-2.5-flash-lite")
    await _log_usage(entity_id, "prioritize", "gemini-2.5-flash-lite",
                     result.get("tokens_in", 0), result.get("tokens_out", 0))

    if "error" in result:
        return result

    parsed = _extract_json(result["text"])
    return {"prioritized": parsed or []} if parsed else {"raw": result["text"]}


async def detect_inter_inconsistencies(entity_id: int, fragments: list[dict]) -> dict:
    """fragments: [{"id", "text", "doc"}] — cross-document pairs."""
    ok, count = await _check_quota()
    if not ok:
        return {"error": "Cuota diaria de Gemini agotada"}

    frags_text = ""
    for f in fragments:
        frags_text += f"\n[{f['doc']}]:\n{f['text'][:300]}\n"

    prompt = (
        "Eres auditor de TI. Analiza estos fragmentos de documentos distintos y detecta inconsistencias entre ellos: "
        "SLAs o plazos contradictorios, responsables que difieren, políticas que se contradicen, "
        "fechas o cifras incompatibles."
        f"{frags_text}"
        '\nResponde SOLO en JSON (sin markdown): {"inconsistencies": [{"description": "descripción clara", '
        '"fragment_a": "fragmento relevante del primer documento", '
        '"fragment_b": "fragmento relevante del segundo documento", '
        '"severity": "alta|media|baja"}]}\n'
        'Si no hay inconsistencias responde: {"inconsistencies": []}'
    )

    result = await _call_gemini(prompt, "gemini-2.5-flash-lite")
    await _log_usage(entity_id, "inter_inconsistency", "gemini-2.5-flash-lite",
                     result.get("tokens_in", 0), result.get("tokens_out", 0))

    if "error" in result:
        return result
    parsed = _extract_json(result["text"])
    return parsed if parsed else {"inconsistencies": []}


async def detect_intra_inconsistencies(entity_id: int, fragments: list[dict]) -> dict:
    ok, count = await _check_quota()
    if not ok:
        return {"error": "Cuota diaria de Gemini agotada"}

    frags_text = ""
    for i, f in enumerate(fragments, 1):
        frags_text += f"\nFRAGMENTO {i}:\n{f['text'][:300]}\n"

    prompt = (
        "Eres auditor de TI. Analiza estos fragmentos del mismo documento y detecta inconsistencias internas: "
        "referencias a secciones inexistentes, conteos que no coinciden, responsables contradictorios, fechas incompatibles."
        f"{frags_text}"
        'Responde SOLO en JSON (sin markdown): {"inconsistencies": [{"description": "descripción clara", '
        '"fragment_a": "texto del primer fragmento relevante", "fragment_b": "texto del segundo fragmento relevante", '
        '"severity": "alta|media|baja"}]}\n'
        'Si no hay inconsistencias responde: {"inconsistencies": []}'
    )

    result = await _call_gemini(prompt, "gemini-2.5-flash-lite")
    await _log_usage(entity_id, "intra_inconsistency", "gemini-2.5-flash-lite",
                     result.get("tokens_in", 0), result.get("tokens_out", 0))

    if "error" in result:
        return result

    parsed = _extract_json(result["text"])
    return parsed if parsed else {"inconsistencies": []}


async def check_inconsistency(entity_id: int, fragment_a: str, fragment_b: str) -> dict:
    ok, count = await _check_quota()
    if not ok:
        return {"error": "Cuota diaria de Gemini agotada"}

    prompt = f"""Eres un auditor de TI. Analiza si estos dos fragmentos de documentos organizacionales contienen una contradicción real entre sí.

FRAGMENTO A:
{fragment_a[:400]}

FRAGMENTO B:
{fragment_b[:400]}

Responde SOLO en JSON válido (sin markdown):
{{"contradiction": true, "type": "date|deadline|responsible|figure|policy|none", "severity": "alta|media|baja", "explanation": "máx 80 palabras explicando la contradicción o por qué no la hay"}}"""

    result = await _call_gemini(prompt, "gemini-2.5-flash-lite")
    await _log_usage(entity_id, "check_inconsistency", "gemini-2.5-flash-lite",
                     result.get("tokens_in", 0), result.get("tokens_out", 0))

    if "error" in result:
        return result

    parsed = _extract_json(result["text"])
    return parsed or {"raw": result["text"]}


async def test_api_key(api_key: str) -> dict:
    url = f"{GEMINI_BASE}/gemma-4-27b-it:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": "Di solo: OK"}]}],
        "generationConfig": {"maxOutputTokens": 5},
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.post(url, json=payload)
            if r.status_code == 200:
                return {"valid": True}
            return {"valid": False, "error": f"HTTP {r.status_code}"}
        except Exception as e:
            return {"valid": False, "error": str(e)}
