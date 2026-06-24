"""
Text-to-Speech routes — mounted under /api.

Two-tier strategy so the "Listen" button always produces audio:
  1. LuxTTS voice-cloning microservice (separate container) — the cloned voice.
  2. Local `espeak-ng` fallback in this container — always available, offline,
     no GPU or reference voice needed (generic voice). Used whenever the LuxTTS
     service is down/not ready.

- POST /api/tts/         → { "text": "..." } -> audio/wav
- GET  /api/tts/health/  → which backend is serving audio
"""
import asyncio
import logging
import os
import shutil
import subprocess
import tempfile
import time

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response

from app.config import settings
from app.schemas import TTSRequest

logger = logging.getLogger("api")
router = APIRouter()

# After a failed connect, skip the LuxTTS service for a bit so we don't pay the
# connect timeout on every request while it's down.
_luxtts_skip_until = 0.0
_LUXTTS_SKIP_SECONDS = 60.0


async def _try_luxtts(text: str) -> bytes | None:
    """Return WAV bytes from the LuxTTS service, or None if unavailable/not ready."""
    global _luxtts_skip_until
    if not settings.tts_enabled:
        return None
    if time.monotonic() < _luxtts_skip_until:
        return None

    url = f"{settings.tts_base_url.rstrip('/')}/synthesize"
    timeout = httpx.Timeout(settings.tts_timeout, connect=3.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json={"text": text})
    except (httpx.ConnectError, httpx.TimeoutException, httpx.ConnectTimeout):
        _luxtts_skip_until = time.monotonic() + _LUXTTS_SKIP_SECONDS
        logger.info("LuxTTS unreachable; using local fallback for %ss", _LUXTTS_SKIP_SECONDS)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("LuxTTS request failed: %s", exc)
        return None

    if resp.status_code == 200 and resp.content:
        return resp.content
    # Service is up but not ready yet (e.g. missing reference voice) — fall back.
    logger.info("LuxTTS not ready (HTTP %s); using local fallback", resp.status_code)
    return None


def _espeak_sync(text: str) -> bytes | None:
    exe = shutil.which("espeak-ng") or shutil.which("espeak")
    if not exe:
        return None
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        subprocess.run(
            [exe, "-v", "en-us", "-s", "160", "-w", path, text],
            check=True,
            timeout=30,
            capture_output=True,
        )
        with open(path, "rb") as fh:
            data = fh.read()
        return data or None
    except Exception as exc:  # noqa: BLE001
        logger.warning("espeak-ng fallback failed: %s", exc)
        return None
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


async def _local_tts(text: str) -> bytes | None:
    if not settings.tts_local_fallback:
        return None
    return await asyncio.to_thread(_espeak_sync, text)


@router.post("/tts/")
async def synthesize(req: TTSRequest) -> Response:
    if not settings.tts_enabled:
        raise HTTPException(status_code=503, detail="TTS is disabled.")

    text = req.text.strip()[:2000]
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    audio = await _try_luxtts(text)
    if audio is None:
        audio = await _local_tts(text)

    if not audio:
        raise HTTPException(
            status_code=503,
            detail="No TTS backend available (LuxTTS down and espeak-ng missing).",
        )

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/tts/health/")
async def tts_health() -> JSONResponse:
    local_ok = bool(
        settings.tts_local_fallback
        and (shutil.which("espeak-ng") or shutil.which("espeak"))
    )

    luxtts: dict = {"reachable": False}
    if settings.tts_enabled:
        url = f"{settings.tts_base_url.rstrip('/')}/health"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0, connect=2.0)) as client:
                resp = await client.get(url)
            luxtts = {"reachable": True, "status_code": resp.status_code, **_safe_json(resp)}
        except Exception as exc:  # noqa: BLE001
            luxtts = {"reachable": False, "error": str(exc)}

    serving = "luxtts" if luxtts.get("status_code") == 200 else ("local" if local_ok else "none")
    return JSONResponse(
        status_code=200 if serving != "none" else 503,
        content={"status": "ok" if serving != "none" else "degraded",
                 "serving": serving, "local_fallback": local_ok, "luxtts": luxtts},
    )


def _safe_json(resp: httpx.Response) -> dict:
    try:
        data = resp.json()
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        return {}
