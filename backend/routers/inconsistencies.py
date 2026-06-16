from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import select
from typing import Optional
from database import AsyncSessionLocal
from models import Entity, Inconsistency, Finding
from services.inconsistency_engine import (
    scan_inconsistencies, scan_inter_gemini,
    scan_intra_document, scan_intra_document_engine,
    analyze_document_inconsistencies,
)
from services import gemini_service
import json

router = APIRouter()


class InconsistencyUpdate(BaseModel):
    status: Optional[str] = None


@router.get("/{entity_id}/inconsistencies")
async def list_inconsistencies(entity_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(Inconsistency)
            .where(Inconsistency.entity_id == entity_id)
            .order_by(Inconsistency.created_at.desc())
        )
        items = result.all()
        out = []
        for i in items:
            analysis = None
            if i.gemini_analysis:
                try:
                    analysis = json.loads(i.gemini_analysis)
                except Exception:
                    analysis = {"raw": i.gemini_analysis}
            out.append({
                "id": i.id,
                "scope": "intra" if i.doc_a_id == i.doc_b_id else "inter",
                "doc_a_id": i.doc_a_id,
                "doc_b_id": i.doc_b_id,
                "doc_a_name": i.doc_a_name,
                "doc_b_name": i.doc_b_name,
                "fragment_a_text": i.fragment_a_text,
                "fragment_b_text": i.fragment_b_text,
                "inc_type": i.inc_type,
                "severity": i.severity,
                "description": i.description,
                "status": i.status,
                "gemini_analysis": analysis,
                "gemini_description": i.gemini_description,
                "formal_description": i.formal_description,
                "finding_id": i.finding_id,
                "created_at": i.created_at.isoformat(),
            })
        return out


@router.post("/{entity_id}/inconsistencies/scan")
async def scan(entity_id: int, method: str = "engine"):
    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")

        old_result = await session.exec(
            select(Inconsistency).where(Inconsistency.entity_id == entity_id)
        )
        for old in old_result.all():
            await session.delete(old)
        await session.commit()

        if method == "gemini":
            found = await scan_inter_gemini(entity_id, session)
        else:
            found = await scan_inconsistencies(entity_id, session)

        for inc_data in found:
            inc = Inconsistency(
                entity_id=entity_id,
                doc_a_id=inc_data["doc_a_id"],
                doc_b_id=inc_data["doc_b_id"],
                doc_a_name=inc_data["doc_a_name"],
                doc_b_name=inc_data["doc_b_name"],
                fragment_a_id=inc_data.get("fragment_a_id"),
                fragment_b_id=inc_data.get("fragment_b_id"),
                fragment_a_text=inc_data["fragment_a_text"],
                fragment_b_text=inc_data["fragment_b_text"],
                inc_type=inc_data["inc_type"],
                severity=inc_data["severity"],
                description=inc_data["description"],
                status="detected",
            )
            session.add(inc)
        await session.commit()

        by_type: dict = {}
        for x in found:
            by_type[x["inc_type"]] = by_type.get(x["inc_type"], 0) + 1

        return {"scanned": True, "method": method, "found": len(found), "by_type": by_type}


@router.post("/{entity_id}/inconsistencies/scan-document/{doc_id}")
async def scan_document(entity_id: int, doc_id: int, method: str = "engine"):
    async with AsyncSessionLocal() as session:
        old_result = await session.exec(
            select(Inconsistency).where(
                Inconsistency.entity_id == entity_id,
                Inconsistency.doc_a_id == doc_id,
                Inconsistency.doc_b_id == doc_id,
            )
        )
        for old in old_result.all():
            await session.delete(old)
        await session.commit()

        if method == "gemini":
            found = await scan_intra_document(doc_id, entity_id, session)
        else:
            found = await scan_intra_document_engine(doc_id, entity_id, session)

        for inc_data in found:
            inc = Inconsistency(
                entity_id=entity_id,
                doc_a_id=inc_data["doc_a_id"],
                doc_b_id=inc_data["doc_b_id"],
                doc_a_name=inc_data["doc_a_name"],
                doc_b_name=inc_data["doc_b_name"],
                fragment_a_id=inc_data.get("fragment_a_id"),
                fragment_b_id=inc_data.get("fragment_b_id"),
                fragment_a_text=inc_data["fragment_a_text"],
                fragment_b_text=inc_data["fragment_b_text"],
                inc_type=inc_data["inc_type"],
                severity=inc_data["severity"],
                description=inc_data["description"],
                status="detected",
            )
            session.add(inc)
        await session.commit()

        return {"scanned": True, "doc_id": doc_id, "method": method, "found": len(found)}


@router.post("/{entity_id}/documents/{doc_id}/analyze-inconsistencies")
async def analyze_document(entity_id: int, doc_id: int, request: Request):
    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")

        # Delete previous intra-doc inconsistencies for this document
        old_result = await session.exec(
            select(Inconsistency).where(
                Inconsistency.entity_id == entity_id,
                Inconsistency.doc_a_id == doc_id,
                Inconsistency.doc_b_id == doc_id,
            )
        )
        for old in old_result.all():
            await session.delete(old)
        await session.commit()

        ws_manager = request.app.state.ws_manager
        found = await analyze_document_inconsistencies(
            doc_id=doc_id,
            entity_id=entity_id,
            entity_name=entity.name,
            session=session,
            broadcast=ws_manager.broadcast,
        )

        for inc_data in found:
            inc = Inconsistency(
                entity_id=entity_id,
                doc_a_id=inc_data["doc_a_id"],
                doc_b_id=inc_data["doc_b_id"],
                doc_a_name=inc_data["doc_a_name"],
                doc_b_name=inc_data["doc_b_name"],
                fragment_a_id=inc_data.get("fragment_a_id"),
                fragment_b_id=inc_data.get("fragment_b_id"),
                fragment_a_text=inc_data["fragment_a_text"],
                fragment_b_text=inc_data["fragment_b_text"],
                inc_type=inc_data["inc_type"],
                severity=inc_data["severity"],
                description=inc_data["description"],
                gemini_description=inc_data.get("gemini_description"),
                formal_description=inc_data.get("formal_description"),
                status="detected",
            )
            session.add(inc)
        await session.commit()

        return {"found": len(found), "doc_id": doc_id}


@router.post("/{entity_id}/inconsistencies/{inc_id}/analyze")
async def analyze_inconsistency(entity_id: int, inc_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(Inconsistency).where(
                Inconsistency.id == inc_id, Inconsistency.entity_id == entity_id
            )
        )
        inc = result.first()
        if not inc:
            raise HTTPException(404, "Inconsistencia no encontrada")

        analysis = await gemini_service.check_inconsistency(
            entity_id=entity_id,
            fragment_a=inc.fragment_a_text[:400],
            fragment_b=inc.fragment_b_text[:400],
        )

        if "error" not in analysis:
            inc.gemini_analysis = json.dumps(analysis, ensure_ascii=False)
            inc.status = "analyzed"
            session.add(inc)
            await session.commit()

        return analysis


@router.post("/{entity_id}/inconsistencies/{inc_id}/promote")
async def promote_to_finding(entity_id: int, inc_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(Inconsistency).where(
                Inconsistency.id == inc_id, Inconsistency.entity_id == entity_id
            )
        )
        inc = result.first()
        if not inc:
            raise HTTPException(404, "Inconsistencia no encontrada")

        if inc.finding_id:
            return {"finding_id": inc.finding_id, "already_promoted": True}

        finding = Finding(
            entity_id=entity_id,
            process_id="GENERAL",
            title=f"Inconsistencia ({inc.inc_type}): {inc.description[:90]}",
            description=(
                f"Inconsistencia tipo '{inc.inc_type}' detectada entre:\n"
                f"• {inc.doc_a_name}\n• {inc.doc_b_name}\n\n{inc.description}"
            ),
            origin="inconsistency",
            severity=inc.severity,
            evidence_fragments=json.dumps(
                [x for x in [inc.fragment_a_id, inc.fragment_b_id] if x]
            ),
        )
        session.add(finding)
        await session.commit()
        await session.refresh(finding)

        inc.finding_id = finding.id
        inc.status = "promoted"
        session.add(inc)
        await session.commit()

        return {"finding_id": finding.id}


@router.put("/{entity_id}/inconsistencies/{inc_id}")
async def update_inconsistency(entity_id: int, inc_id: int, body: InconsistencyUpdate):
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(Inconsistency).where(
                Inconsistency.id == inc_id, Inconsistency.entity_id == entity_id
            )
        )
        inc = result.first()
        if not inc:
            raise HTTPException(404, "Inconsistencia no encontrada")

        if body.status is not None:
            inc.status = body.status
        session.add(inc)
        await session.commit()
        return {"success": True}


@router.delete("/{entity_id}/inconsistencies/{inc_id}")
async def delete_inconsistency(entity_id: int, inc_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(Inconsistency).where(
                Inconsistency.id == inc_id, Inconsistency.entity_id == entity_id
            )
        )
        inc = result.first()
        if not inc:
            raise HTTPException(404, "Inconsistencia no encontrada")
        await session.delete(inc)
        await session.commit()
        return {"success": True}
