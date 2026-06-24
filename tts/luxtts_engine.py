"""
LuxTTS voice-cloning engine wrapper.

LuxTTS (https://huggingface.co/YatharthS/LuxTTS) is a lightweight ZipVoice-based
text-to-speech model for high-quality voice cloning. Given a short reference clip
(REFERENCE_VOICE_PATH) plus the text spoken in that clip (REFERENCE_TEXT), it
synthesizes new speech in the same voice at 48 kHz.

This module isolates *all* model-specific code behind a tiny interface
(`load()` / `synthesize()` / `ready()` / `info()`) so the rest of the service —
and the rest of the app — never has to know how the model is invoked. If the
weights or reference sample are not present yet, the service still boots and
reports `ready=false` via /health instead of crash-looping.

Plugging in the model
---------------------
The upstream inference code lives at https://github.com/ysharma3501/LuxTTS.git
(referenced from the HF model card). Install it in the Docker image and fill in
`_synthesize_impl()` below. Everything else (HTTP, WAV encoding, config, error
handling) is already done.
"""
from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np

logger = logging.getLogger("luxtts")

MODEL_ID = os.getenv("LUXTTS_MODEL_ID", "YatharthS/LuxTTS")
DEVICE = os.getenv("LUXTTS_DEVICE", "cpu")  # "cuda" if a GPU is available
SAMPLE_RATE = int(os.getenv("LUXTTS_SAMPLE_RATE", "48000"))
REFERENCE_VOICE_PATH = os.getenv("REFERENCE_VOICE_PATH", "/app/voices/reference.wav")
REFERENCE_TEXT = os.getenv(
    "REFERENCE_TEXT",
    "",  # the exact words spoken in the reference clip (improves clone fidelity)
)


@dataclass
class EngineState:
    model: object | None = None
    error: Optional[str] = None


_state = EngineState()
_lock = threading.Lock()


def _reference_available() -> bool:
    return bool(REFERENCE_VOICE_PATH) and os.path.isfile(REFERENCE_VOICE_PATH)


def load() -> None:
    """Load the LuxTTS model once. Safe to call repeatedly; never raises."""
    with _lock:
        if _state.model is not None or _state.error is not None:
            return
        try:
            _state.model = _load_impl()
            logger.info("LuxTTS model loaded on %s", DEVICE)
        except Exception as exc:  # noqa: BLE001 — keep the service alive
            _state.error = f"{type(exc).__name__}: {exc}"
            logger.warning("LuxTTS model not loaded: %s", _state.error)


def ready() -> bool:
    return _state.model is not None and _reference_available()


def info() -> dict:
    return {
        "model_id": MODEL_ID,
        "device": DEVICE,
        "sample_rate": SAMPLE_RATE,
        "model_loaded": _state.model is not None,
        "reference_voice_present": _reference_available(),
        "reference_voice_path": REFERENCE_VOICE_PATH,
        "error": _state.error,
    }


def synthesize(text: str) -> Tuple[np.ndarray, int]:
    """
    Synthesize `text` in the cloned reference voice.
    Returns (mono float32 waveform in [-1, 1], sample_rate).
    Raises RuntimeError with an actionable message if not ready.
    """
    text = (text or "").strip()
    if not text:
        raise RuntimeError("Empty text.")
    if _state.model is None:
        load()
    if _state.model is None:
        raise RuntimeError(
            f"LuxTTS model unavailable ({_state.error}). "
            "Install the LuxTTS inference package in the image and implement _synthesize_impl()."
        )
    if not _reference_available():
        raise RuntimeError(
            f"Reference voice not found at {REFERENCE_VOICE_PATH}. "
            "Mount a short WAV/MP3 of the voice to clone (and set REFERENCE_TEXT)."
        )
    wav = _synthesize_impl(text)
    wav = np.asarray(wav, dtype=np.float32).reshape(-1)
    peak = float(np.max(np.abs(wav))) if wav.size else 0.0
    if peak > 1.0:
        wav = wav / peak
    return wav, SAMPLE_RATE


# ── Model-specific glue — the only part tied to LuxTTS internals ──────────────
def _load_impl() -> object:
    """
    Load and return the LuxTTS model handle.

    Reference implementation (uncomment once the LuxTTS package from
    github.com/ysharma3501/LuxTTS is installed in the image):

        from luxtts import LuxTTS                      # provided by the repo
        return LuxTTS.from_pretrained(MODEL_ID, device=DEVICE)

    Until then we raise so the service reports ready=false instead of pretending.
    """
    try:
        from luxtts import LuxTTS  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "luxtts package not installed (see github.com/ysharma3501/LuxTTS)"
        ) from exc
    return LuxTTS.from_pretrained(MODEL_ID, device=DEVICE)  # type: ignore[attr-defined]


def _synthesize_impl(text: str) -> np.ndarray:
    """
    Run inference and return a 1-D waveform at SAMPLE_RATE.

    Reference implementation (adapt to the repo's actual call signature):

        return _state.model.generate(
            text=text,
            prompt_audio=REFERENCE_VOICE_PATH,
            prompt_text=REFERENCE_TEXT or None,
            num_steps=4,            # LuxTTS is distilled to 4 steps
        )
    """
    return _state.model.generate(  # type: ignore[union-attr]
        text=text,
        prompt_audio=REFERENCE_VOICE_PATH,
        prompt_text=REFERENCE_TEXT or None,
    )
