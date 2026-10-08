"""FarmAs AI service: the 3 endpoints the Node API (api/) expects.

  POST /nlu/extract      JSON {text, context?}            -> {intent, confidence, language, entities}
  POST /health/assess    multipart {symptoms, ...image?}  -> assessment
  POST /stt/transcribe   multipart {file}                 -> {transcription}
  GET  /healthz

Run from the ai-service folder:  uvicorn app.main:app --port 8001
"""
from __future__ import annotations

import hmac
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app import ai_client, config, health, nlu, stt

PRODUCTION = config.APP_ENV == "production"

# This service spends OpenAI credit on every call. In production it must never run open to the internet:
# refuse to start unless callers have to present the shared internal key.
if PRODUCTION and len(config.INTERNAL_KEY) < 16:
    raise RuntimeError(
        "AI_SERVICE_ENV=production requires MODEL_SERVICE_INTERNAL_KEY (16+ characters), "
        "the same value the API uses. Refusing to start without it."
    )

app = FastAPI(
    title="FarmAs AI service",
    version="0.1.0",
    # No public documentation page in production.
    docs_url=None if PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if PRODUCTION else "/openapi.json",
)


def require_internal_key(x_internal_key: Optional[str] = Header(default=None)) -> None:
    """Server-to-server guard. Disabled only when MODEL_SERVICE_INTERNAL_KEY is empty (local dev)."""
    if not config.INTERNAL_KEY:
        return
    if not x_internal_key or not hmac.compare_digest(x_internal_key, config.INTERNAL_KEY):
        raise HTTPException(status_code=401, detail="Missing or wrong internal key.")


def _ai_down(e: Exception) -> HTTPException:
    # The Node API turns any 5xx into a friendly "AI is unavailable" message for the farmer.
    return HTTPException(status_code=503, detail=str(e))


@app.get("/healthz")
def healthz():
    return {
        "status": "ok",
        "service": "farmas-ai",
        "model": config.OPENAI_MODEL,
        "stt_model": config.OPENAI_STT_MODEL,
        "ai_key_configured": bool(config.OPENAI_API_KEY),
        "knowledge_chunks": len(health.retriever.chunks) if health.retriever else 0,
    }


class ExtractIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    context: Optional[dict] = None


@app.post("/nlu/extract", response_model=nlu.NluResult, dependencies=[Depends(require_internal_key)])
def nlu_extract(body: ExtractIn):
    try:
        return nlu.extract(body.text, body.context)
    except ai_client.AiUnavailable as e:
        raise _ai_down(e) from e


@app.post("/health/assess", response_model=health.Assessment, dependencies=[Depends(require_internal_key)])
async def health_assess(
    symptoms: str = Form(..., min_length=3, max_length=2000),
    species: Optional[str] = Form(None),
    number_affected: Optional[int] = Form(None, ge=0, le=1_000_000),
    total: Optional[int] = Form(None, ge=0, le=1_000_000),
    mortality: Optional[int] = Form(None, ge=0, le=1_000_000),
    onset: Optional[str] = Form(None),
    drinking: Optional[str] = Form(None),
    vaccinated: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    media = None
    if image is not None and image.filename:
        if not (image.content_type or "").startswith("image/"):
            raise HTTPException(status_code=400, detail="The photo must be an image.")
        data = await image.read()
        if len(data) > config.MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="That photo is too large (max 8 MB).")
        media = (data, image.content_type)

    h = health.HealthInput(
        symptoms=symptoms, species=species, number_affected=number_affected, total=total,
        mortality=mortality, onset=onset, drinking=drinking, vaccinated=vaccinated,
    )
    try:
        return health.assess(h, media)
    except ai_client.AiUnavailable as e:
        raise _ai_down(e) from e


class TranscribeOut(BaseModel):
    transcription: str


@app.post("/stt/transcribe", response_model=TranscribeOut, dependencies=[Depends(require_internal_key)])
async def stt_transcribe(file: UploadFile = File(...)):
    mime = stt.normalize_mime(file.content_type or "", file.filename or "")
    if not mime:
        raise HTTPException(status_code=400, detail="Unsupported audio type. Use ogg, webm, mp3, wav or m4a.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The audio file is empty.")
    if len(data) > config.MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="That recording is too long (max 16 MB).")
    try:
        return TranscribeOut(transcription=stt.transcribe(data, mime))
    except ai_client.AiUnavailable as e:
        raise _ai_down(e) from e
