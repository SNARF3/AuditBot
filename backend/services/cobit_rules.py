import json
import os
from datetime import datetime
from typing import Optional
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from models import DocumentFragment, CobitCoverage, Finding


def _load_processes() -> dict:
    path = os.path.join(os.path.dirname(__file__), "..", "cobit", "cobit_41.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {p["id"]: p for p in data["processes"]}


PROCESSES = _load_processes()


def has_keywords(fragments: list[dict], keywords: list[str]) -> bool:
    combined = " ".join(f.get("content", "").lower() for f in fragments)
    return any(kw.lower() in combined for kw in keywords)


def has_type(fragments: list[dict], doc_type: str) -> bool:
    return any(f.get("fragment_type") == doc_type for f in fragments)


def has_operational_evidence(fragments: list[dict]) -> bool:
    return has_type(fragments, "evidencia_operativa")


def evaluate_process(process_id: str, fragments: list[dict]) -> dict:
    proc = PROCESSES.get(process_id)
    if not proc:
        return {"status": "no_data", "gaps": [], "evidence_count": 0, "gap_count": 0, "fragments_linked": []}

    keywords = proc.get("keywords", [])
    relevant_frags = [f for f in fragments if any(kw.lower() in f.get("content", "").lower() for kw in keywords)]

    matched_keywords = [kw for kw in keywords if any(kw.lower() in f.get("content", "").lower() for f in fragments)]
    coverage_ratio = len(matched_keywords) / max(len(keywords), 1)

    gaps = []
    active_gap_ids = []

    for gap_def in proc.get("auto_gaps", []):
        condition = gap_def["condition"]
        triggered = False

        if condition == "no_keywords":
            triggered = not has_keywords(fragments, keywords)
        elif condition == "partial_no_operational":
            triggered = has_keywords(fragments, keywords) and not has_operational_evidence(fragments)
        elif condition == "policy_without_operational":
            has_policy = has_keywords(fragments, ["política", "norma"])
            triggered = has_policy and not has_keywords(fragments, ["incidente", "registro", "log"])
        elif condition == "no_incident_management":
            triggered = not has_keywords(fragments, ["incidente", "gestión de incidentes", "mesa de ayuda"])
        elif condition == "backup_no_test":
            has_backup = has_keywords(fragments, ["backup", "respaldo"])
            triggered = has_backup and not has_keywords(fragments, ["restauración", "prueba", "verificación"])
        elif condition == "plan_no_test":
            has_plan = has_keywords(fragments, ["BCP", "DRP", "continuidad"])
            triggered = has_plan and not has_keywords(fragments, ["prueba", "ejercicio", "simulacro"])

        if triggered:
            gaps.append({
                "gap_id": gap_def["id"],
                "description": gap_def["description"],
                "severity": gap_def["severity"],
            })
            active_gap_ids.append(gap_def["id"])

    if not relevant_frags:
        status = "no_data"
    elif gaps and coverage_ratio < 0.3:
        status = "gap"
    elif gaps:
        status = "partial"
    elif coverage_ratio >= 0.5:
        status = "compliant"
    else:
        status = "partial"

    return {
        "status": status,
        "gaps": gaps,
        "evidence_count": len(relevant_frags),
        "gap_count": len(gaps),
        "fragments_linked": [f["id"] for f in relevant_frags if "id" in f],
    }


async def recalculate_coverage(entity_id: int, session: AsyncSession, scoped_domains: Optional[list] = None) -> dict:
    frags_result = await session.exec(
        select(DocumentFragment).where(DocumentFragment.entity_id == entity_id)
    )
    raw_frags = frags_result.all()
    fragments = [
        {
            "id": f.id,
            "content": f.content,
            "fragment_type": f.fragment_type,
            "cobit_hint": f.cobit_hint,
        }
        for f in raw_frags
    ]

    coverage_summary = {}
    auto_findings = []

    for process_id, proc_data in PROCESSES.items():
        domain = proc_data["domain"]
        if scoped_domains and domain not in scoped_domains:
            await _upsert_coverage(entity_id, process_id, domain, "not_scoped", 0, 0, [], session)
            coverage_summary[process_id] = "not_scoped"
            continue

        result = evaluate_process(process_id, fragments)

        await _upsert_coverage(
            entity_id, process_id, domain,
            result["status"], result["evidence_count"],
            result["gap_count"], result["fragments_linked"],
            session
        )

        coverage_summary[process_id] = result["status"]

        for gap in result.get("gaps", []):
            existing = await session.exec(
                select(Finding).where(
                    Finding.entity_id == entity_id,
                    Finding.process_id == process_id,
                    Finding.origin == "auto_rule",
                    Finding.status.notin_(["discarded"]),
                )
            )
            if not existing.first():
                finding = Finding(
                    entity_id=entity_id,
                    process_id=process_id,
                    title=f"{process_id} — {gap['description'][:80]}",
                    description=gap["description"],
                    origin="auto_rule",
                    severity=gap["severity"],
                    status="preliminary",
                    evidence_fragments=json.dumps(result["fragments_linked"]),
                )
                session.add(finding)
                auto_findings.append(process_id)

    await session.commit()
    return {"coverage": coverage_summary, "new_findings": auto_findings}


async def _upsert_coverage(entity_id, process_id, domain, status, evidence_count, gap_count, fragments_linked, session):
    existing = await session.exec(
        select(CobitCoverage).where(
            CobitCoverage.entity_id == entity_id,
            CobitCoverage.process_id == process_id,
        )
    )
    cov = existing.first()
    if cov:
        cov.status = status
        cov.evidence_count = evidence_count
        cov.gap_count = gap_count
        cov.last_calculated = datetime.utcnow()
        cov.fragments_linked = json.dumps(fragments_linked)
        session.add(cov)
    else:
        cov = CobitCoverage(
            entity_id=entity_id,
            process_id=process_id,
            domain=domain,
            status=status,
            evidence_count=evidence_count,
            gap_count=gap_count,
            last_calculated=datetime.utcnow(),
            fragments_linked=json.dumps(fragments_linked),
        )
        session.add(cov)
