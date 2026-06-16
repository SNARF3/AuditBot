from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from database import AsyncSessionLocal
from models import Entity, CobitCoverage, DocumentFragment
from services.cobit_rules import PROCESSES
from services import gemini_service
from datetime import datetime
import json

router = APIRouter()


@router.post("/{entity_id}/coverage/{process_id}/analyze")
async def analyze_process(entity_id: int, process_id: str):
    proc = PROCESSES.get(process_id)
    if not proc:
        raise HTTPException(404, "Proceso COBIT no encontrado")

    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")

        frags_result = await session.exec(
            select(DocumentFragment).where(DocumentFragment.entity_id == entity_id)
        )
        all_frags = frags_result.all()

        keywords = [kw.lower() for kw in proc.get("keywords", [])]
        relevant_frags = [
            {"id": f.id, "content": f.content, "page_ref": f.page_ref}
            for f in all_frags
            if any(kw in (f.content or "").lower() for kw in keywords)
            or f.cobit_hint == process_id
        ][:8]

        result = await gemini_service.analyze_process(
            entity_id=entity_id,
            process_id=process_id,
            process_name=proc["name"],
            entity_name=entity.name,
            fragments=relevant_frags,
        )

        if "error" not in result:
            cov_result = await session.exec(
                select(CobitCoverage).where(
                    CobitCoverage.entity_id == entity_id,
                    CobitCoverage.process_id == process_id,
                )
            )
            cov = cov_result.first()
            if cov:
                cov.ai_analysis = json.dumps(result)
                cov.ai_analyzed_at = datetime.utcnow()
                if "status" in result:
                    cov.status = result["status"]
                session.add(cov)
                await session.commit()

        return result


@router.post("/{entity_id}/traceability/prioritize")
async def prioritize_gaps(entity_id: int):
    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")

        cov_result = await session.exec(
            select(CobitCoverage).where(CobitCoverage.entity_id == entity_id)
        )
        coverage = cov_result.all()
        gaps = [
            {"process_id": c.process_id, "description": PROCESSES.get(c.process_id, {}).get("name", "")}
            for c in coverage
            if c.status in ("gap", "partial")
        ]

        return await gemini_service.prioritize_gaps(
            entity_id=entity_id,
            entity_name=entity.name,
            entity_industry=entity.industry or "general",
            gaps=gaps,
        )
