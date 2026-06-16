from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from sqlmodel import select
from database import AsyncSessionLocal
from models import Entity, Finding, CobitCoverage
from services.cobit_rules import PROCESSES
from services.risk_chains import detect_risk_chains
from services.report_generator import generate_pdf
import json

router = APIRouter()


@router.get("/{entity_id}/report/preview")
async def report_preview(entity_id: int):
    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")

        findings_result = await session.exec(
            select(Finding).where(
                Finding.entity_id == entity_id,
                Finding.status.in_(["validated", "included"]),
            )
        )
        findings = findings_result.all()

        cov_result = await session.exec(
            select(CobitCoverage).where(CobitCoverage.entity_id == entity_id)
        )
        coverage = cov_result.all()

        return {
            "entity": {"id": entity.id, "name": entity.name, "industry": entity.industry},
            "findings_count": len(findings),
            "findings_included": len([f for f in findings if f.status == "included"]),
            "gap_count": len([c for c in coverage if c.status == "gap"]),
            "partial_count": len([c for c in coverage if c.status == "partial"]),
            "compliant_count": len([c for c in coverage if c.status == "compliant"]),
            "findings": [
                {
                    "id": f.id,
                    "process_id": f.process_id,
                    "title": f.title,
                    "severity": f.severity,
                    "status": f.status,
                    "has_observation": bool(f.formal_observation),
                }
                for f in findings
            ],
        }


@router.post("/{entity_id}/report/generate")
async def generate_report(entity_id: int, body: dict = {}):
    fmt = body.get("format", "pdf")

    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")

        findings_result = await session.exec(
            select(Finding).where(
                Finding.entity_id == entity_id,
                Finding.status == "included",
            )
        )
        findings = [
            {
                "id": f.id,
                "process_id": f.process_id,
                "title": f.title,
                "description": f.description,
                "severity": f.severity,
                "status": f.status,
                "formal_observation": f.formal_observation,
                "auditor_notes": f.auditor_notes,
            }
            for f in findings_result.all()
        ]

        cov_result = await session.exec(
            select(CobitCoverage).where(CobitCoverage.entity_id == entity_id)
        )
        coverage = [
            {
                "process_id": c.process_id,
                "name": PROCESSES.get(c.process_id, {}).get("name", ""),
                "status": c.status,
                "evidence_count": c.evidence_count,
            }
            for c in cov_result.all()
        ]

        chains = await detect_risk_chains(entity_id, session)
        entity_dict = {"id": entity.id, "name": entity.name, "industry": entity.industry}

    if fmt == "json":
        return {"entity": entity_dict, "findings": findings, "coverage": coverage, "risk_chains": chains}

    pdf_bytes = generate_pdf(entity_dict, findings, coverage, chains)
    filename = f"auditoria_{entity.name.replace(' ', '_')}_{entity.id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
