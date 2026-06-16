from fastapi import APIRouter, HTTPException
from sqlmodel import select
from database import AsyncSessionLocal
from models import Entity, Document, DocumentFragment, CobitCoverage, Inconsistency
from services.risk_chains import detect_risk_chains
from services.cobit_rules import PROCESSES

router = APIRouter()


@router.get("/{entity_id}/traceability")
async def get_traceability(entity_id: int):
    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")

        chains = await detect_risk_chains(entity_id, session)

        # Build doc → process matrix
        docs_result = await session.exec(
            select(Document).where(Document.entity_id == entity_id, Document.status == "ready")
        )
        docs = docs_result.all()

        frags_result = await session.exec(
            select(DocumentFragment).where(DocumentFragment.entity_id == entity_id)
        )
        all_frags = frags_result.all()

        cov_result = await session.exec(
            select(CobitCoverage).where(CobitCoverage.entity_id == entity_id)
        )
        coverage_map = {c.process_id: c.status for c in cov_result.all()}

        matrix = {}
        for doc in docs:
            doc_frags = [f for f in all_frags if f.document_id == doc.id]
            touched_processes = set()
            for frag in doc_frags:
                if frag.cobit_hint:
                    touched_processes.add(frag.cobit_hint)
                for pid, proc in PROCESSES.items():
                    if any(kw.lower() in (frag.content or "").lower() for kw in proc.get("keywords", [])):
                        touched_processes.add(pid)
            matrix[doc.original_name or doc.filename] = list(touched_processes)

        scoped_processes = [
            pid for pid, cov_status in coverage_map.items()
            if cov_status != "not_scoped"
        ]

        inc_result = await session.exec(
            select(Inconsistency).where(Inconsistency.entity_id == entity_id)
        )
        all_inc = inc_result.all()
        active_inc = [i for i in all_inc if i.status not in ("dismissed",)]
        inc_by_type = {}
        for i in active_inc:
            inc_by_type[i.inc_type] = inc_by_type.get(i.inc_type, 0) + 1

        return {
            "risk_chains": chains,
            "doc_process_matrix": matrix,
            "coverage_summary": coverage_map,
            "scoped_processes": scoped_processes,
            "inconsistencies_summary": {
                "total": len(active_inc),
                "by_type": inc_by_type,
                "promoted": len([i for i in active_inc if i.status == "promoted"]),
            },
        }
