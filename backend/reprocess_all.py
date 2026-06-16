"""One-shot script: reprocess all documents whose only fragment is the extraction-failure placeholder."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from sqlmodel import select
from database import AsyncSessionLocal
from models import Document, DocumentFragment
from services.ingestion import process_document, DATA_DIR


async def main():
    async with AsyncSessionLocal() as session:
        # Find docs with failed extraction
        frags_result = await session.exec(
            select(DocumentFragment).where(
                DocumentFragment.content == "[No se pudo extraer texto del PDF]"
            )
        )
        bad_frags = frags_result.all()
        bad_doc_ids = list({f.document_id for f in bad_frags})

    print(f"Documentos a reprocesar: {len(bad_doc_ids)} → {bad_doc_ids}")

    for doc_id in bad_doc_ids:
        async with AsyncSessionLocal() as session:
            doc_result = await session.exec(select(Document).where(Document.id == doc_id))
            doc = doc_result.first()
            if not doc:
                print(f"  [{doc_id}] No encontrado, saltando")
                continue

            file_path = DATA_DIR / doc.filename
            if not file_path.exists():
                print(f"  [{doc_id}] Archivo no encontrado en disco: {file_path}")
                continue

            # Delete old fragments
            old_frags = await session.exec(
                select(DocumentFragment).where(DocumentFragment.document_id == doc_id)
            )
            for f in old_frags.all():
                await session.delete(f)

            doc.status = "pending"
            doc.page_count = None
            doc.extracted_entities = None
            doc.classification_status = "pending"
            session.add(doc)
            await session.commit()

            original_name = doc.original_name
            doc_type = doc.doc_type
            entity_id = doc.entity_id

        print(f"  [{doc_id}] Procesando: {original_name} ...", end=" ", flush=True)

        async with AsyncSessionLocal() as bg_session:
            await process_document(
                doc_id=doc_id,
                entity_id=entity_id,
                file_path=file_path,
                original_name=original_name,
                doc_type=doc_type,
                session=bg_session,
                broadcast=None,
            )

        # Check result
        async with AsyncSessionLocal() as check_session:
            doc_result = await check_session.exec(select(Document).where(Document.id == doc_id))
            doc = doc_result.first()
            frags_result = await check_session.exec(
                select(DocumentFragment).where(DocumentFragment.document_id == doc_id)
            )
            frags = frags_result.all()
            non_empty = [f for f in frags if f.content and f.content != "[No se pudo extraer texto del PDF]" and len(f.content) > 30]
            print(f"status={doc.status} fragmentos={len(frags)} con_contenido={len(non_empty)}")

    print("\nListo.")


if __name__ == "__main__":
    asyncio.run(main())
