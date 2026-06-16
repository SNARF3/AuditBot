import httpx
import logging

logger = logging.getLogger(__name__)

OLLAMA_BASE = "http://localhost:11434"
MODELS_TO_TRY = ["llama3.2:1b", "llama3.2:3b"]

_SYSTEM = (
    "Eres un editor de texto. Tu única función es sustituir palabras en una oración. "
    "Respondes únicamente con la oración modificada, sin comentarios ni explicaciones."
)

_PROMPT = (
    'Oración: "{description}"\n\n'
    'Sustituye en esa oración cualquier aparición de: '
    '"el documento", "la organización", "la entidad", "el banco", "la institución", '
    '"este banco", "esta entidad", "esta organización" '
    'por el nombre: {entity_name}\n\n'
    'Escribe solo la oración resultante:'
)


async def personalize_description(gemini_description: str, entity_name: str) -> dict:
    prompt = _PROMPT.format(
        description=gemini_description.replace('"', "'"),
        entity_name=entity_name,
    )
    last_error = "sin intentos"

    for model in MODELS_TO_TRY:
        url = f"{OLLAMA_BASE}/api/generate"
        logger.info("[Ollama] intentando %s con modelo %s", url, model)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.post(
                    url,
                    json={
                        "model": model,
                        "system": _SYSTEM,
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": 0.1, "num_predict": 80},
                    },
                )
                if r.status_code == 200:
                    data = r.json()
                    text = data.get("response", "").strip()
                    if text:
                        logger.info("[Ollama] OK modelo=%s tokens=%d", model, len(text.split()))
                        return {"text": text, "model": model}
                    last_error = f"HTTP 200 pero respuesta vacía (modelo {model})"
                else:
                    last_error = f"HTTP {r.status_code}: {r.text[:120]}"
                    logger.warning("[Ollama] %s → %s", url, last_error)
        except httpx.ConnectError as e:
            last_error = f"ConnectError en {url}: {e}"
            logger.warning("[Ollama] %s", last_error)
        except httpx.TimeoutException:
            last_error = f"Timeout (15 s) conectando a {url} con {model}"
            logger.warning("[Ollama] %s", last_error)
        except Exception as e:
            last_error = f"{type(e).__name__}: {e}"
            logger.warning("[Ollama] error inesperado: %s", last_error)

    msg = f"Modelo local no disponible ({last_error}) — verificar Ollama en {OLLAMA_BASE}"
    logger.error("[Ollama] %s", msg)
    return {"error": msg}
