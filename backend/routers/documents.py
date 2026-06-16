from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from sqlmodel import select
from database import AsyncSessionLocal
from models import Document, DocumentFragment, Entity
from services.ingestion import process_document, compute_hash, DATA_DIR
import json
import aiofiles

router = APIRouter()


@router.get("/{entity_id}/documents")
async def list_documents(entity_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(Document).where(Document.entity_id == entity_id)
        )
        docs = result.all()
        return [
            {
                "id": d.id,
                "original_name": d.original_name,
                "doc_type": d.doc_type,
                "status": d.status,
                "classification_status": d.classification_status,
                "page_count": d.page_count,
                "extracted_entities": json.loads(d.extracted_entities) if d.extracted_entities else {},
                "created_at": d.created_at.isoformat(),
            }
            for d in docs
        ]


@router.post("/{entity_id}/documents")
async def upload_document(
    entity_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_type: str = Form("normativo"),
):
    async with AsyncSessionLocal() as session:
        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        if not entity:
            raise HTTPException(404, "Entidad no encontrada")

        content = await file.read()
        file_hash = compute_hash(content)

        existing = await session.exec(
            select(Document).where(
                Document.entity_id == entity_id,
                Document.file_hash == file_hash,
            )
        )
        dup = existing.first()
        if dup:
            return {
                "id": dup.id,
                "duplicate": True,
                "message": "Documento ya procesado anteriormente",
            }

        safe_name = f"{entity_id}_{file_hash[:8]}_{file.filename}"
        file_path = DATA_DIR / safe_name
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)

        doc = Document(
            entity_id=entity_id,
            filename=safe_name,
            original_name=file.filename,
            doc_type=doc_type,
            file_hash=file_hash,
            status="pending",
        )
        session.add(doc)
        await session.commit()
        await session.refresh(doc)
        doc_id = doc.id

        scoped_domains = json.loads(entity.cobit_scope) if entity.cobit_scope else ["PO","AI","DS","ME"]

    ws_manager = request.app.state.ws_manager

    async def run_pipeline():
        async with AsyncSessionLocal() as bg_session:
            await process_document(
                doc_id=doc_id,
                entity_id=entity_id,
                file_path=file_path,
                original_name=file.filename,
                doc_type=doc_type,
                session=bg_session,
                broadcast=ws_manager.broadcast,
                scoped_domains=scoped_domains,
            )

    background_tasks.add_task(run_pipeline)

    return {
        "id": doc_id,
        "status": "pending",
        "message": "Documento en cola de procesamiento",
    }


@router.post("/{entity_id}/documents/{doc_id}/reprocess")
async def reprocess_document(entity_id: int, doc_id: int, request: Request, background_tasks: BackgroundTasks):
    async with AsyncSessionLocal() as session:
        doc_result = await session.exec(
            select(Document).where(Document.id == doc_id, Document.entity_id == entity_id)
        )
        doc = doc_result.first()
        if not doc:
            raise HTTPException(404, "Documento no encontrado")

        file_path = DATA_DIR / doc.filename
        if not file_path.exists():
            raise HTTPException(422, "Archivo físico no encontrado en disco")

        # Delete existing fragments so they get regenerated cleanly
        frags_result = await session.exec(
            select(DocumentFragment).where(DocumentFragment.document_id == doc_id)
        )
        for frag in frags_result.all():
            await session.delete(frag)

        doc.status = "pending"
        doc.page_count = None
        doc.extracted_entities = None
        doc.classification_status = "pending"
        session.add(doc)
        await session.commit()

        entity_result = await session.exec(select(Entity).where(Entity.id == entity_id))
        entity = entity_result.first()
        scoped_domains = json.loads(entity.cobit_scope) if entity and entity.cobit_scope else ["PO", "AI", "DS", "ME"]
        original_name = doc.original_name
        doc_type = doc.doc_type

    ws_manager = request.app.state.ws_manager

    async def run_pipeline():
        async with AsyncSessionLocal() as bg_session:
            await process_document(
                doc_id=doc_id,
                entity_id=entity_id,
                file_path=file_path,
                original_name=original_name,
                doc_type=doc_type,
                session=bg_session,
                broadcast=ws_manager.broadcast,
                scoped_domains=scoped_domains,
            )

    background_tasks.add_task(run_pipeline)
    return {"doc_id": doc_id, "status": "pending", "message": "Reprocesando documento"}


@router.delete("/{entity_id}/documents/{doc_id}")
async def delete_document(entity_id: int, doc_id: int):
    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(Document).where(Document.id == doc_id, Document.entity_id == entity_id)
        )
        doc = result.first()
        if not doc:
            raise HTTPException(404, "Documento no encontrado")

        file_path = DATA_DIR / doc.filename
        if file_path.exists():
            file_path.unlink()

        await session.delete(doc)
        await session.commit()
        return {"success": True}
