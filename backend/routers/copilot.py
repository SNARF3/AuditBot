from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from typing import Optional
from database import AsyncSessionLocal
from models import Entity, CobitCoverage, Finding
from services import gemini_service
from services.cobit_rules import PROCESSES

router = APIRouter()


class ChatMessage(BaseModel):
    message: str
    history: Optional[list[dict]] = []


@router.post("/{entity_id}/copilot/chat")
async def chat(entity_id: int, body: ChatMessage):
    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")

        cov_result = await session.exec(
            select(CobitCoverage).where(CobitCoverage.entity_id == entity_id)
        )
        coverage = cov_result.all()
        top_gaps = [
            f"{c.process_id} ({PROCESSES.get(c.process_id, {}).get('name', '')})"
            for c in coverage
            if c.status in ("gap",)
        ][:5]

        findings_result = await session.exec(
            select(Finding).where(
                Finding.entity_id == entity_id,
                Finding.status == "validated",
            )
        )
        validated_count = len(findings_result.all())

    context = {
        "name": entity.name,
        "industry": entity.industry or "general",
        "top_gaps": top_gaps,
        "validated_findings": validated_count,
    }

    return await gemini_service.copilot_chat(
        entity_id=entity_id,
        message=body.message,
        context=context,
        history=body.history or [],
    )


@router.post("/{entity_id}/copilot/explain/{process_id}")
async def explain_process(entity_id: int, process_id: str):
    proc = PROCESSES.get(process_id)
    if not proc:
        raise HTTPException(404, "Proceso no encontrado")

    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")

    return await gemini_service.explain_process(
        entity_id=entity_id,
        process_id=process_id,
        process_name=proc["name"],
        entity_industry=entity.industry or "general",
    )
