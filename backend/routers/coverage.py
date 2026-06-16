from fastapi import APIRouter, HTTPException
from sqlmodel import select
from database import AsyncSessionLocal
from models import CobitCoverage, Entity, DocumentFragment, Finding
from services.cobit_rules import recalculate_coverage, PROCESSES
import json

router = APIRouter()


@router.get("/{entity_id}/coverage")
async def get_coverage(entity_id: int):
    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")

        result = await session.exec(
            select(CobitCoverage).where(CobitCoverage.entity_id == entity_id)
        )
        coverage_list = result.all()
        coverage_map = {c.process_id: c for c in coverage_list}

        out = []
        domains = ["PO", "AI", "DS", "ME"]
        for domain in domains:
            domain_procs = [p for pid, p in PROCESSES.items() if p["domain"] == domain]
            for proc in domain_procs:
                pid = proc["id"]
                cov = coverage_map.get(pid)
                ai_analysis = None
                if cov and cov.ai_analysis:
                    try:
                        ai_analysis = json.loads(cov.ai_analysis)
                    except Exception:
                        pass
                out.append({
                    "process_id": pid,
                    "domain": domain,
                    "name": proc["name"],
                    "importance": proc["importance"],
                    "status": cov.status if cov else "no_data",
                    "evidence_count": cov.evidence_count if cov else 0,
                    "gap_count": cov.gap_count if cov else 0,
                    "fragments_linked": json.loads(cov.fragments_linked) if cov and cov.fragments_linked else [],
                    "ai_analysis": ai_analysis,
                    "ai_analyzed_at": cov.ai_analyzed_at.isoformat() if cov and cov.ai_analyzed_at else None,
                    "last_calculated": cov.last_calculated.isoformat() if cov and cov.last_calculated else None,
                })

        return {"entity_id": entity_id, "coverage": out}


@router.post("/{entity_id}/coverage/recalc")
async def recalculate(entity_id: int):
    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")
        scoped = json.loads(entity.cobit_scope) if entity.cobit_scope else ["PO","AI","DS","ME"]
        result = await recalculate_coverage(entity_id, session, scoped)
        return result


@router.get("/{entity_id}/coverage/{process_id}/fragments")
async def get_process_fragments(entity_id: int, process_id: str):
    proc = PROCESSES.get(process_id)
    if not proc:
        raise HTTPException(404, "Proceso no encontrado")

    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(DocumentFragment).where(DocumentFragment.entity_id == entity_id)
        )
        all_frags = result.all()

        keywords = [kw.lower() for kw in proc.get("keywords", [])]
        relevant = [
            f for f in all_frags
            if any(kw in (f.content or "").lower() for kw in keywords)
            or f.cobit_hint == process_id
        ][:12]

        return {
            "process_id": process_id,
            "fragments": [
                {
                    "id": f.id,
                    "content": f.content,
                    "fragment_type": f.fragment_type,
                    "cobit_hint": f.cobit_hint,
                    "confidence": f.confidence,
                    "page_ref": f.page_ref,
                }
                for f in relevant
            ],
        }


@router.get("/{entity_id}/coverage/{process_id}/findings")
async def get_process_findings(entity_id: int, process_id: str):
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(Finding).where(
                Finding.entity_id == entity_id,
                Finding.process_id == process_id,
            )
        )
        findings = result.all()
        return [
            {
                "id": f.id,
                "title": f.title,
                "description": f.description,
                "origin": f.origin,
                "severity": f.severity,
                "status": f.status,
            }
            for f in findings
        ]
