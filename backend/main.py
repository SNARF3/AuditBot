from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List
import json

from database import init_db
from routers import setup, entities, documents, coverage, analysis, findings, traceability, report, copilot, inconsistencies


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, entity_id: str):
        await websocket.accept()
        if entity_id not in self.active_connections:
            self.active_connections[entity_id] = []
        self.active_connections[entity_id].append(websocket)

    def disconnect(self, websocket: WebSocket, entity_id: str):
        if entity_id in self.active_connections:
            self.active_connections[entity_id].remove(websocket)

    async def broadcast(self, entity_id: str, message: dict):
        if entity_id in self.active_connections:
            dead = []
            for ws in self.active_connections[entity_id]:
                try:
                    await ws.send_text(json.dumps(message))
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.active_connections[entity_id].remove(ws)


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="AuditBot v2 API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(setup.router, prefix="/setup", tags=["setup"])
app.include_router(entities.router, prefix="/entities", tags=["entities"])
app.include_router(documents.router, prefix="/entities", tags=["documents"])
app.include_router(coverage.router, prefix="/entities", tags=["coverage"])
app.include_router(analysis.router, prefix="/entities", tags=["analysis"])
app.include_router(findings.router, prefix="/entities", tags=["findings"])
app.include_router(traceability.router, prefix="/entities", tags=["traceability"])
app.include_router(report.router, prefix="/entities", tags=["report"])
app.include_router(copilot.router, prefix="/entities", tags=["copilot"])
app.include_router(inconsistencies.router, prefix="/entities", tags=["inconsistencies"])


@app.websocket("/ws/{entity_id}")
async def websocket_endpoint(websocket: WebSocket, entity_id: str):
    await manager.connect(websocket, entity_id)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, entity_id)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/gemini/usage")
async def get_global_gemini_usage():
    from database import AsyncSessionLocal
    from sqlmodel import select
    from models import GeminiUsage
    from datetime import date
    async with AsyncSessionLocal() as session:
        today = date.today().isoformat()
        result = await session.exec(
            select(GeminiUsage).where(
                GeminiUsage.created_at >= today
            )
        )
        usage = result.all()
        return {
            "today_requests": len(usage),
            "daily_limit": 250,
            "remaining": max(0, 250 - len(usage)),
        }


app.state.ws_manager = manager
