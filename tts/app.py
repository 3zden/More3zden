"""
LuxTTS voice-cloning microservice (FastAPI).

Endpoints
  GET  /health      → readiness + model/reference status
  POST /synthesize  → { "text": "..." } -> audio/wav (48 kHz, mono, 16-bit)

The model is loaded once on startup (best-effort — the service still boots if
weights/reference aren't present yet). The backend calls this over HTTP; it is
never exposed to the public directly.
"""
import io
import logging
import wave

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

import luxtts_engine as engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tts")

app = FastAPI(title="LuxTTS Service", version="1.0.0")


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


@app.on_event("startup")
async def _startup() -> None:
    engine.load()


@app.get("/health")
async def health() -> JSONResponse:
    ok = engine.ready()
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ok" if ok else "degraded", **engine.info()},
    )


def _to_wav_bytes(wav: np.ndarray, sample_rate: int) -> bytes:
    pcm16 = np.clip(wav, -1.0, 1.0)
    pcm16 = (pcm16 * 32767.0).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm16.tobytes())
    return buf.getvalue()


@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest) -> Response:
    try:
        wav, sr = engine.synthesize(req.text)
    except RuntimeError as exc:
        # Not ready / misconfigured — actionable, not a 500.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Synthesis failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    audio = _to_wav_bytes(wav, sr)
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )
