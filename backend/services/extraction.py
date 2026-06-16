import re
import json
from typing import Optional


ROLE_PATTERNS = [
    r"(?:responsable|encargado|jefe|director|gerente|coordinador|analista|oficial|CISO|CIO|CTO)\s+(?:de\s+)?[A-Z][a-záéíóúñ\s]{2,30}",
    r"[A-Z][a-záéíóúñ]+\s+[A-Z][a-záéíóúñ]+\s*[-–]\s*(?:responsable|jefe|director|gerente|coordinador)",
]

DATE_PATTERNS = [
    r"\b(20\d{2}[-–/]\d{2}[-–/]\d{2})\b",
    r"\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?20\d{2}\b",
    r"\b(?:vigencia|vigente|periodo|período|año fiscal)[:.\s]+20\d{2}\b",
    r"\b20\d{2}\s*[-–]\s*20\d{2}\b",
]

CONTROL_PATTERNS = [
    r"\b(PO\d{1,2}|AI\d|DS\d{1,2}|ME\d)\b",
    r"\b(ISO\s*(?:270\d{2}|9001|22301))\b",
    r"\b(COBIT|ITIL|NIST|SOC\s*[12]|SOX|GDPR)\b",
    r"\b(firewall|antivirus|IDS|IPS|WAF|SIEM|DLP)\b",
]

TECH_PATTERNS = [
    r"\b(SAP|Oracle|Microsoft|AWS|Azure|Google Cloud|VMware|Cisco|IBM|Linux|Windows Server)\b",
    r"\b(SQL Server|PostgreSQL|MySQL|MongoDB|Redis|Kafka)\b",
    r"\b(Docker|Kubernetes|Terraform|Ansible|Jenkins)\b",
]


def _find_all(text: str, patterns: list[str]) -> list[str]:
    found = set()
    for p in patterns:
        for m in re.finditer(p, text, re.IGNORECASE):
            found.add(m.group(0).strip())
    return list(found)[:20]


def extract_structured_entities(text: str) -> dict:
    return {
        "responsables": _find_all(text, ROLE_PATTERNS),
        "fechas": _find_all(text, DATE_PATTERNS),
        "controles": _find_all(text, CONTROL_PATTERNS),
        "tecnologias": _find_all(text, TECH_PATTERNS),
    }


def segment_into_fragments(markdown_text: str, max_chars: int = 500) -> list[dict]:
    fragments = []
    sections = re.split(r"\n#{1,4} ", markdown_text)

    for i, section in enumerate(sections):
        section = section.strip()
        if len(section) < 30:
            continue

        if len(section) <= max_chars:
            fragments.append({
                "content": section[:max_chars],
                "page_ref": f"seccion_{i+1}",
            })
        else:
            # Split by paragraph
            paragraphs = re.split(r"\n{2,}", section)
            current = ""
            para_idx = 0
            for para in paragraphs:
                para = para.strip()
                if not para or len(para) < 20:
                    continue
                if len(current) + len(para) + 2 <= max_chars:
                    current = (current + "\n\n" + para).strip() if current else para
                else:
                    if current:
                        fragments.append({
                            "content": current[:max_chars],
                            "page_ref": f"seccion_{i+1}_p{para_idx}",
                        })
                        para_idx += 1
                    current = para[:max_chars]
            if current:
                fragments.append({
                    "content": current[:max_chars],
                    "page_ref": f"seccion_{i+1}_p{para_idx}",
                })

    return fragments[:200]


def classify_fragment_basic(content: str, doc_type: Optional[str] = None) -> dict:
    """Rule-based classification without LLM for immediate use."""
    content_lower = content.lower()

    cobit_scores: dict[str, float] = {}

    KEYWORD_MAP = {
        "PO1": ["peti", "plan estratégico", "objetivos ti", "alineación"],
        "PO9": ["gestión de riesgos", "registro de riesgos", "metodología riesgo"],
        "DS5": ["seguridad", "acceso", "contraseña", "firewall", "incidente"],
        "DS11": ["backup", "respaldo", "restauración", "recuperación"],
        "DS4": ["continuidad", "bcp", "drp", "contingencia"],
        "AI6": ["cambio", "control de cambios", "rfc"],
        "DS8": ["mesa de ayuda", "help desk", "incidente", "ticket"],
        "ME1": ["kpi", "indicadores", "métricas", "monitoreo"],
        "ME3": ["cumplimiento", "regulatorio", "normativa"],
    }

    for process, kw_list in KEYWORD_MAP.items():
        score = sum(1 for kw in kw_list if kw in content_lower)
        if score > 0:
            cobit_scores[process] = score / len(kw_list)

    best_process = max(cobit_scores, key=lambda k: cobit_scores[k]) if cobit_scores else None
    confidence = cobit_scores.get(best_process, 0.0) if best_process else 0.0

    type_keywords = {
        "control": ["control", "política", "norma", "estándar", "procedimiento"],
        "politica": ["política", "lineamiento", "directriz"],
        "procedimiento": ["procedimiento", "proceso", "paso", "instrucción"],
        "riesgo": ["riesgo", "amenaza", "vulnerabilidad", "impacto"],
        "evidencia_operativa": ["registro", "log", "acta", "informe", "reporte", "resultado"],
        "responsable": ["responsable", "encargado", "jefe", "director", "gerente"],
    }

    detected_type = None
    for ftype, kw_list in type_keywords.items():
        if any(kw in content_lower for kw in kw_list):
            detected_type = ftype
            break

    if not detected_type and doc_type:
        type_map = {
            "normativo": "politica",
            "operativo": "evidencia_operativa",
            "estrategico": "control",
            "contractual": "control",
        }
        detected_type = type_map.get(doc_type, "control")

    return {
        "fragment_type": detected_type or "control",
        "cobit_hint": best_process,
        "confidence": round(min(confidence, 1.0), 2),
    }
