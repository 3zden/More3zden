FROM python:3.11-slim

# System deps: git to clone the LuxTTS repo, ffmpeg/libsndfile for audio I/O,
# curl for the container healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    curl \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Service deps first (better layer caching).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── LuxTTS inference package ──────────────────────────────────────────────────
# Installs the upstream ZipVoice-based engine referenced by the HF model card.
# CPU torch by default; for GPU swap the index URL to a CUDA build and set
# LUXTTS_DEVICE=cuda in the environment.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir "git+https://github.com/ysharma3501/LuxTTS.git" \
    || echo "WARN: LuxTTS package install failed; service will report ready=false until fixed."

# Service code
COPY . .

# Mount point for the reference voice clip (docker-compose mounts ./tts/voices here).
RUN mkdir -p /app/voices

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -fsS http://localhost:9000/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9000", "--workers", "1"]
