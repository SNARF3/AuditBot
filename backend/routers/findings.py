from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from typing import Optional
from database import AsyncSessionLocal
from models import Finding, DocumentFragment, Entity
from services import gemini_service
from services.cobit_rules import PROCESSES
from datetime import datetime
import json

router = APIRouter()


class FindingCreate(BaseModel):
    process_id: str
    title: str
    description: Optional[str] = None
    severity: Optional[str] = "media"
    auditor_notes: Optional[str] = None


class FindingUpdate(BaseModel):
    status: Optional[str] = None
    severity: Optional[str] = None
    auditor_notes: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    probability: Optional[int] = None
    impact: Optional[int] = None


@router.get("/{entity_id}/findings")
async def list_findings(entity_id: int, status: Optional[str] = None, severity: Optional[str] = None):
    async with AsyncSessionLocal() as session:
        query = select(Finding).where(Finding.entity_id == entity_id)
        if status and status != "all":
            query = query.where(Finding.status == status)
        if severity and severity != "all":
            query = query.where(Finding.severity == severity)

        result = await session.exec(query.order_by(Finding.created_at.desc()))
        findings = result.all()

        out = []
        for f in findings:
            obs = None
            if f.formal_observation:
                try:
                    obs = json.loads(f.formal_observation)
                except Exception:
                    obs = {"raw": f.formal_observation}
            out.append({
                "id": f.id,
                "process_id": f.process_id,
                "process_name": PROCESSES.get(f.process_id, {}).get("name", ""),
                "title": f.title,
                "description": f.description,
                "origin": f.origin,
                "severity": f.severity,
                "status": f.status,
                "evidence_fragments": json.loads(f.evidence_fragments) if f.evidence_fragments else [],
                "auditor_notes": f.auditor_notes,
                "formal_observation": obs,
                "has_observation": obs is not None,
                "probability": f.probability,
                "impact": f.impact,
                "created_at": f.created_at.isoformat(),
                "updated_at": f.updated_at.isoformat() if f.updated_at else None,
            })
        return out


@router.post("/{entity_id}/findings")
async def create_finding(entity_id: int, body: FindingCreate):
    async with AsyncSessionLocal() as session:
        finding = Finding(
            entity_id=entity_id,
            process_id=body.process_id,
            title=body.title,
            description=body.description,
            origin="manual",
            severity=body.severity,
            auditor_notes=body.auditor_notes,
        )
        session.add(finding)
        await session.commit()
        await session.refresh(finding)
        return {"id": finding.id}


@router.put("/{entity_id}/findings/{finding_id}")
async def update_finding(entity_id: int, finding_id: int, body: FindingUpdate):
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(Finding).where(Finding.id == finding_id, Finding.entity_id == entity_id)
        )
        finding = result.first()
        if not finding:
            raise HTTPException(404, "Hallazgo no encontrado")

        if body.status is not None:
            finding.status = body.status
        if body.severity is not None:
            finding.severity = body.severity
        if body.auditor_notes is not None:
            finding.auditor_notes = body.auditor_notes
        if body.title is not None:
            finding.title = body.title
        if body.description is not None:
            finding.description = body.description
        if body.probability is not None:
            finding.probability = body.probability
        if body.impact is not None:
            finding.impact = body.impact
        finding.updated_at = datetime.utcnow()

        session.add(finding)
        await session.commit()
        return {"success": True}


@router.post("/{entity_id}/findings/{finding_id}/draft")
async def draft_observation(entity_id: int, finding_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(Finding).where(Finding.id == finding_id, Finding.entity_id == entity_id)
        )
        finding = result.first()
        if not finding:
            raise HTTPException(404, "Hallazgo no encontrado")

        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()

        evidence = ""
        if finding.evidence_fragments:
            frag_ids = json.loads(finding.evidence_fragments)
            if frag_ids:
                frags = await session.exec(
                    select(DocumentFragment).where(DocumentFragment.id.in_(frag_ids))
                )
                evidence = " | ".join(f.content[:200] for f in frags.all()[:3])

        proc = PROCESSES.get(finding.process_id, {})
        result_ai = await gemini_service.draft_finding(
            entity_id=entity_id,
            process_id=finding.process_id,
            process_name=proc.get("name", finding.process_id),
            gap_description=finding.description or finding.title,
            evidence=evidence or "Sin evidencia documental específica",
        )

        if "error" not in result_ai:
            finding.formal_observation = json.dumps(result_ai, ensure_ascii=False)
            finding.updated_at = datetime.utcnow()
            session.add(finding)
            await session.commit()

        return result_ai


@router.delete("/{entity_id}/findings/{finding_id}")
async def delete_finding(entity_id: int, finding_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(Finding).where(Finding.id == finding_id, Finding.entity_id == entity_id)
        )
        finding = result.first()
        if not finding:
            raise HTTPException(404, "Hallazgo no encontrado")
        await session.delete(finding)
        await session.commit()
        return {"success": True}
