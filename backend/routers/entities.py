from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from typing import Optional
from database import AsyncSessionLocal
from models import Entity, CobitCoverage, Finding, Document
from services.cobit_rules import PROCESSES
from datetime import datetime
import json

router = APIRouter()


class EntityCreate(BaseModel):
    name: str
    industry: Optional[str] = None
    description: Optional[str] = None
    cobit_scope: Optional[list[str]] = None  # ['PO','AI','DS','ME']


@router.get("")
async def list_entities():
    async with AsyncSessionLocal() as session:
        result = await session.exec(select(Entity).where(Entity.status == "active"))
        entities = result.all()

        out = []
        for e in entities:
            coverage = await session.exec(
                select(CobitCoverage).where(CobitCoverage.entity_id == e.id)
            )
            cov_list = coverage.all()

            docs = await session.exec(
                select(Document).where(Document.entity_id == e.id)
            )
            doc_list = docs.all()

            findings = await session.exec(
                select(Finding).where(Finding.entity_id == e.id)
            )
            finding_list = findings.all()

            domain_stats = {}
            for c in cov_list:
                d = c.domain
                if d not in domain_stats:
                    domain_stats[d] = {"total": 0, "compliant": 0}
                domain_stats[d]["total"] += 1
                if c.status in ("compliant", "partial"):
                    domain_stats[d]["compliant"] += 1

            coverage_pct = {}
            for d, s in domain_stats.items():
                coverage_pct[d] = round(s["compliant"] / s["total"] * 100) if s["total"] else 0

            out.append({
                "id": e.id,
                "name": e.name,
                "industry": e.industry,
                "description": e.description,
                "cobit_scope": json.loads(e.cobit_scope) if e.cobit_scope else ["PO","AI","DS","ME"],
                "created_at": e.created_at.isoformat(),
                "status": e.status,
                "doc_count": len(doc_list),
                "finding_count": len(finding_list),
                "validated_count": len([f for f in finding_list if f.status == "validated"]),
                "coverage_pct": coverage_pct,
            })

        return out


@router.post("")
async def create_entity(body: EntityCreate):
    async with AsyncSessionLocal() as session:
        scope = body.cobit_scope or ["PO", "AI", "DS", "ME"]
        entity = Entity(
            name=body.name,
            industry=body.industry,
            description=body.description,
            cobit_scope=json.dumps(scope),
        )
        session.add(entity)
        await session.commit()
        await session.refresh(entity)

        for proc_id, proc_data in PROCESSES.items():
            domain = proc_data["domain"]
            status = "no_data" if domain in scope else "not_scoped"
            cov = CobitCoverage(
                entity_id=entity.id,
                process_id=proc_id,
                domain=domain,
                status=status,
            )
            session.add(cov)
        await session.commit()

        return {"id": entity.id, "name": entity.name}


@router.get("/{entity_id}")
async def get_entity(entity_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")
        return {
            "id": entity.id,
            "name": entity.name,
            "industry": entity.industry,
            "description": entity.description,
            "cobit_scope": json.loads(entity.cobit_scope) if entity.cobit_scope else ["PO","AI","DS","ME"],
            "created_at": entity.created_at.isoformat(),
            "status": entity.status,
        }


@router.put("/{entity_id}")
async def update_entity(entity_id: int, body: EntityCreate):
    async with AsyncSessionLocal() as session:
        result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")
        entity.name = body.name
        entity.industry = body.industry
        entity.description = body.description
        if body.cobit_scope:
            entity.cobit_scope = json.dumps(body.cobit_scope)
        session.add(entity)
        await session.commit()
        return {"success": True}


@router.delete("/{entity_id}")
async def delete_entity(entity_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")
        entity.status = "archived"
        session.add(entity)
        await session.commit()
        return {"success": True}
