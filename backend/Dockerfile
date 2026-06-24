FROM python:3.12-slim

# System deps (curl for the container healthcheck; build tools for any source
# wheels; espeak-ng for the local text-to-speech fallback)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

# Data directory for the FAISS index
RUN mkdir -p /app/data

# Non-root user
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Schema creation + FAISS index build happen in the app's lifespan startup.
# Single worker: the embedding model + FAISS index live in process memory.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
