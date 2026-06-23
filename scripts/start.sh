#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# More3zdenAI – Quick Start Script
# Run this once to get the full stack running locally.
# ─────────────────────────────────────────────────────────────────────────────
set -e

OLLAMA_MODEL=${OLLAMA_MODEL:-qwen2.5:3b}
OLLAMA_START_TIMEOUT=${OLLAMA_START_TIMEOUT:-300}
BACKEND_START_TIMEOUT=${BACKEND_START_TIMEOUT:-180}

echo "Starting More3zdenAI..."

# 1. Copy .env if not present
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env from .env.example — edit it before going to production!"
fi

# 2. Build & start services
echo "🐳 Building and starting Docker services..."
docker compose up -d --build db redis ollama

# 3. Wait for Ollama to be ready
echo "⏳ Waiting for Ollama to start..."
elapsed=0
until docker compose exec -T ollama ollama list > /dev/null 2>&1; do
  sleep 3
  elapsed=$((elapsed + 3))
  echo "  still waiting..."

  if [ "$elapsed" -ge "$OLLAMA_START_TIMEOUT" ]; then
    echo "❌ Ollama did not become ready within ${OLLAMA_START_TIMEOUT}s"
    echo "   Check logs: docker compose logs --tail=100 ollama"
    exit 1
  fi
done
echo "✅ Ollama is ready"

# 4. Pull the LLM model
echo "📥 Pulling Ollama model: $OLLAMA_MODEL (this may take a few minutes)..."
docker compose exec ollama ollama pull $OLLAMA_MODEL
echo "✅ Model $OLLAMA_MODEL downloaded"

# 5. Start backend (builds FAISS index on first run)
echo "🔧 Starting FastAPI backend..."
docker compose up -d --build backend

echo "⏳ Waiting for backend to be healthy..."
elapsed=0
until docker compose exec -T backend curl -sf http://localhost:8000/api/health/ > /dev/null 2>&1; do
  # Bail out early if the backend crashed instead of starting (e.g. bad DB
  # credentials or a stale FAISS cache) — otherwise this loop spins forever.
  status=$(docker compose ps --format '{{.Status}}' backend 2>/dev/null)
  if echo "$status" | grep -qiE 'restarting|exited'; then
    echo "❌ Backend is not starting (status: $status). Recent logs:"
    docker compose logs --tail=40 backend
    exit 1
  fi

  sleep 5
  elapsed=$((elapsed + 5))
  echo "  still starting (building FAISS index)... (${elapsed}s)"

  if [ "$elapsed" -ge "$BACKEND_START_TIMEOUT" ]; then
    echo "❌ Backend did not become healthy within ${BACKEND_START_TIMEOUT}s. Recent logs:"
    docker compose logs --tail=40 backend
    exit 1
  fi
done
echo "✅ Backend is healthy"

# 6. Start frontend
echo "🎨 Starting Next.js frontend..."
docker compose up -d --build frontend nginx

echo ""
echo "═══════════════════════════════════════════════════"
echo "✅ More3zdenAI is running!"
echo ""
echo "  🌐 Frontend:  http://localhost"
echo "  🔌 API:       http://localhost/api/"
echo "  🏥 Health:    http://localhost/api/health/"
echo "  🛠  Admin:     http://localhost/admin/"
echo "═══════════════════════════════════════════════════"
