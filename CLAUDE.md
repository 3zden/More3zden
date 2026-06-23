# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

More3zdenAI is a RAG-powered portfolio chat assistant. A Next.js UI streams answers from an **async FastAPI** backend, which retrieves context from a FAISS vector index built over `knowledge_base/*.md` and generates grounded answers with a local Ollama LLM (`qwen2.5:3b`). PostgreSQL stores conversation history; Redis caches answers. Nginx fronts everything on port 80.

> See `docs/architecture.md` for Mermaid flow/sequence diagrams.
> Note: `README.md` still describes the original Django backend — the backend is now FastAPI under `backend/app/`.

## Running

The whole stack runs via Docker Compose. There is no host-level dev setup for the backend (it expects `db`, `redis`, `ollama` hostnames). To run uvicorn locally you'd need those services reachable and the env vars from `.env`.

```bash
./scripts/start.sh          # First-time / full startup: pulls the model, builds FAISS index, starts all services
docker compose up -d --build
docker compose logs -f backend
docker compose down
```

URLs: UI `http://localhost`, API `http://localhost/api/`, health `http://localhost/api/health/`, interactive API docs `http://localhost:8000/docs` (FastAPI, when backend port is exposed).

> `docker/nginx.conf` still proxies `/admin/` and `/static/` to the backend — those were Django-only and now 404. Harmless, but can be removed.

## Tests & lint

```bash
# Backend — pytest (smoke tests; no DB/Ollama/embedding model needed, but faiss must be installed)
docker compose exec backend python -m pytest -q
docker compose exec backend python -m pytest tests/test_smoke.py::test_cache_key_is_stable_and_normalized

# Frontend
cd frontend && npx tsc --noEmit && npm run build
```

CI (`.github/workflows/ci-cd.yml`) installs `backend/requirements.txt`, runs `pytest`, and builds the frontend on push/PR to `main`. (ESLint is not configured — `npm run lint` triggers an interactive setup prompt; use `tsc --noEmit` for the type gate.)

## Rebuilding the FAISS index

The index is built once on backend startup (in the FastAPI lifespan, `RAGPipeline.warm()` → `FAISSVectorStore.load_or_build()`) and persisted to the `faiss_data` volume at `/app/data/`. **Editing `knowledge_base/portfolio.md` does NOT rebuild it** — delete the cached files and restart:

```bash
docker compose exec backend python -c "import os; os.remove('/app/data/faiss.index'); os.remove('/app/data/chunks.pkl')"
docker compose restart backend
```

## Switching the Ollama model

Set `OLLAMA_MODEL` in `.env` (default `qwen2.5:3b`). After changing, pull it and restart:

```bash
docker compose exec ollama ollama pull <model>
docker compose restart backend
```

## Architecture & data flow

**FastAPI app** (`backend/app/`):
- `main.py` — app + CORS + lifespan: `init_db()` (SQLAlchemy `create_all`, no migration tool) then `get_pipeline().warm()` (loads embedding model + FAISS index).
- `config.py` — `pydantic-settings` `Settings`, single source of config. Builds the async DSN (`postgresql+asyncpg://…`) and CORS origins list from env.
- `routes/chat.py` — the 4 endpoints (under `/api`).
- `database.py` — async engine, `AsyncSessionLocal`, `get_session` dependency, `init_db()`. `expire_on_commit=False` so model attrs stay readable after commit.
- `models.py` / `schemas.py` — SQLAlchemy 2.0 `Conversation`/`Message` (Postgres `JSONB` for `sources`) and Pydantic I/O schemas.
- `cache.py` — async Redis answer cache; **stable** `cache_key` = `rag:{sha256(question.lower().strip())[:32]}`.

**RAG pipeline** (`backend/app/rag/`) — module-level singletons (`get_pipeline`, `get_vector_store`, `get_ollama_client`):
- `loader.py` — splits markdown by `#/##/###` headers into `DocumentChunk`s (sliding window for long sections, 500 words / 50 overlap).
- `vector_store.py` — `sentence-transformers` (`all-MiniLM-L6-v2`) embeddings, normalized vectors in a FAISS `IndexFlatIP` (inner product = cosine). **Synchronous/CPU-bound** — pipeline calls it via `asyncio.to_thread`.
- `llm_client.py` — async `OllamaClient` (httpx); `generate()` and `stream()` against Ollama `/api/generate` (`temperature=0.3`, `num_predict=512`), with `SYSTEM_PROMPT`.
- `pipeline.py` — `RAGPipeline`: retrieve top-k → drop chunks below `RAG_MIN_SCORE` (0.3) → generate. `query()` returns a `RAGResponse`; `stream()` yields **structured event dicts** (`{type: sources|token|done}`) which the route formats as SSE.

**Endpoints:**
- `POST /api/chat/` — Redis-cached (skips Ollama on hit), persists user + assistant `Message`s.
- `GET /api/chat/stream/?question=…&session_id=…` — SSE. Emits a leading `{type: session}` frame, then `sources`, `token`s, `done`. Persists both turns (assistant saved in a **fresh** session inside the generator, since the request-scoped session closes when the response object is returned).
- `GET /api/health/` — Ollama reachability + FAISS loaded; 503 if degraded.
- `GET /api/conversation/{session_id}/` — full history (`selectinload` messages).

**Frontend** (`frontend/src/`) — Next.js 14 app router. `lib/api.ts` is the only API surface (`sendMessage`, `streamMessage` via `EventSource`, `checkHealth`), prefixed with `NEXT_PUBLIC_API_URL`. `app/page.tsx` holds the `messages` array and streams via `streamMessage(question, sessionId, …)`; `components/ui/message-list.tsx` renders bubbles + source chips + typing indicator.

## Conventions & gotchas

- All config is env-driven. `config.py` uses pydantic-settings, but the `rag/` modules still read `os.getenv` directly at import (same env vars) — keep both in sync; change values in `.env`, not code.
- Single uvicorn worker (`Dockerfile` CMD): the embedding model + FAISS index live in process memory; multiple workers would each reload them.
- Streaming persistence uses `AsyncSessionLocal()` directly (not the `get_session` dependency) because SSE generator code runs after the endpoint returns and the dependency session is already closing.
- Root `requirements.txt` is stale boilerplate — the real backend deps are `backend/requirements.txt`.
