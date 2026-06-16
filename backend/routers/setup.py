from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import select
from database import AsyncSessionLocal
from models import SystemConfig
from datetime import datetime
import httpx

router = APIRouter()


class SetupConfig(BaseModel):
    gemini_api_key: str
    ollama_available: bool = False


@router.get("/status")
async def get_status():
    async with AsyncSessionLocal() as session:
        result = await session.exec(select(SystemConfig))
        configs = {c.key: c.value for c in result.all()}

    has_key = bool(configs.get("gemini_api_key"))
    onboarding_done = configs.get("onboarding_completed") == "true"

    ollama_ok = False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get("http://localhost:11434/api/tags")
            ollama_ok = r.status_code == 200
    except Exception:
        pass

    return {
        "configured": has_key and onboarding_done,
        "has_api_key": has_key,
        "ollama_available": ollama_ok,
        "onboarding_completed": onboarding_done,
    }


@router.post("/config")
async def save_config(config: SetupConfig):
    async with AsyncSessionLocal() as session:
        now = datetime.utcnow()

        async def upsert(key, value):
            result = await session.exec(select(SystemConfig).where(SystemConfig.key == key))
            cfg = result.first()
            if cfg:
                cfg.value = value
                cfg.updated_at = now
                session.add(cfg)
            else:
                session.add(SystemConfig(key=key, value=value, updated_at=now))

        await upsert("gemini_api_key", config.gemini_api_key)
        await upsert("ollama_available", str(config.ollama_available).lower())
        await upsert("onboarding_completed", "true")
        await session.commit()

    return {"success": True}


@router.post("/test-gemini")
async def test_gemini(body: dict):
    api_key = body.get("api_key", "")
    if not api_key:
        return {"valid": False, "error": "No se proporcionó API key"}
    from services.gemini_service import test_api_key
    return await test_api_key(api_key)
