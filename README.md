# More3zdenAI — Production Conversational AI Platform

> An AI-powered portfolio assistant that lets visitors explore Azzeddine's skills, projects, and experience through natural language — built with RAG, FAISS, Ollama, Django, and Next.js.

---

## Overview

More3zdenAI replaces static portfolio navigation with an **AI-first interactive experience**. Visitors can ask natural language questions and get accurate, grounded answers retrieved directly from a structured knowledge base — no hallucinations, no guessing.

The system is built around **Retrieval-Augmented Generation (RAG)**: every answer is backed by semantically retrieved context from the knowledge base, passed to a local LLM running on Ollama.

---

## Architecture

```
User Question
      │
      ▼
┌─────────────────┐
│  Next.js Chat   │  ← React UI with streaming, source attribution
└────────┬────────┘
         │ HTTP / SSE
         ▼
┌─────────────────┐
│  Django REST    │  ← Rate limiting, caching, conversation history
└────────┬────────┘
         │
    ┌────┴─────┐
    ▼          ▼
┌────────┐  ┌──────────────┐
│ FAISS  │  │    Redis     │  ← Vector search + Response cache
│ Index  │  │    Cache     │
└────┬───┘  └──────────────┘
     │ Top-K chunks
     ▼
┌─────────────────┐
│  Ollama (LLM)   │  ← Local inference, no API costs
└─────────────────┘
         │
         ▼
  Grounded Answer
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React, TypeScript, Tailwind CSS |
| Backend | Python, Django 5, Django REST Framework |
| AI / RAG | FAISS, Sentence Transformers, Ollama (llama3.2) |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Proxy | Nginx |
| DevOps | Docker, Docker Compose, GitHub Actions |

---

## Features

- **Conversational RAG** — answers grounded in real portfolio data via FAISS semantic search
- **Local LLM** — fully offline inference with Ollama, zero API costs
- **Streaming responses** — Server-Sent Events for real-time token streaming
- **Response caching** — Redis cache for instant repeat answers
- **Conversation history** — full session persistence in PostgreSQL
- **Source attribution** — every answer shows which knowledge base sections were used
- **Rate limiting** — 30 requests/minute per client
- **CI/CD pipeline** — automated test → build → deploy via GitHub Actions
- **Health monitoring** — `/api/health/` endpoint for all services

---

## Project Structure

```
more3zdenai/
├── backend/
│   ├── api/
│   │   ├── models/          # Conversation + Message models
│   │   ├── views/           # Chat, stream, health endpoints
│   │   └── serializers/     # DRF serializers
│   ├── rag/
│   │   ├── loader.py        # Document chunker
│   │   ├── vector_store.py  # FAISS index builder & search
│   │   ├── llm_client.py    # Ollama client + prompt engineering
│   │   └── pipeline.py      # RAG orchestrator
│   ├── config/              # Django settings, URLs, WSGI
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js app router
│   │   └── lib/api.ts       # API client
│   ├── Dockerfile
│   └── package.json
├── knowledge_base/
│   └── portfolio.md         # ← Edit this with your info
├── docker/
│   └── nginx.conf
├── scripts/
│   └── start.sh             # One-command startup
├── .github/
│   └── workflows/ci-cd.yml  # GitHub Actions pipeline
├── docker-compose.yml
└── .env.example
```

---

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- Git
- 4GB+ free disk space (for the LLM model)

### 1. Clone the repository

```bash
git clone https://github.com/3zden/more3zdenai.git
cd more3zdenai
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if needed (defaults work for local development)
```

### 3. Add your knowledge base

Edit `knowledge_base/portfolio.md` with your real information — skills, projects, experience, contact details. The more detailed, the better the AI answers.

### 4. Fix the Ollama healthcheck in `docker-compose.yml`

```yaml
ollama:
  healthcheck:
    test: ["CMD", "ollama", "list"]
    interval: 30s
    timeout: 10s
    retries: 5
    start_period: 30s
```

### 5. Launch everything

```bash
chmod +x scripts/start.sh
./scripts/start.sh
```

The script will:
- Start PostgreSQL, Redis, and Ollama
- Pull the `llama3.2` model (~2GB, first run only)
- Build the FAISS vector index from your knowledge base
- Start Django, Next.js, and Nginx

### 6. Open the app

```
http://localhost              → Chat UI
http://localhost/api/health/  → Service health check
http://localhost/admin/       → Django admin
```

---

## Updating Your Knowledge Base

Edit `knowledge_base/portfolio.md`, then rebuild the FAISS index:

```bash
docker compose exec backend python -c "
import os
os.remove('/app/data/faiss.index')
os.remove('/app/data/chunks.pkl')
from rag.vector_store import FAISSVectorStore
FAISSVectorStore().build()
"
docker compose restart backend
```

---

## API Reference

### `POST /api/chat/`

Send a message and get a grounded AI response.

```json
// Request
{
  "question": "What technologies does Azzeddine work with?",
  "session_id": "uuid-optional"
}

// Response
{
  "answer": "Azzeddine works with Python, Django, React...",
  "sources": [{ "section": "Technical Skills", "score": 0.91, "preview": "..." }],
  "session_id": "uuid",
  "cached": false,
  "latency_ms": 842,
  "model": "llama3.2"
}
```

### `GET /api/chat/stream/?question=...`

Server-Sent Events streaming endpoint. Emits `sources`, `token`, and `done` events.

### `GET /api/health/`

Returns status of all services: Django, Ollama, FAISS.

### `GET /api/conversation/<session_id>/`

Retrieve full conversation history for a session.

---

## CI/CD

The GitHub Actions pipeline (`.github/workflows/ci-cd.yml`) runs on every push to `main`:

1. **Test backend** — Django tests against a real PostgreSQL + Redis instance
2. **Build frontend** — Next.js production build
3. **Deploy** — SSH into production server, pull, rebuild, migrate

To enable deployment, add these secrets to your GitHub repository:

| Secret | Description |
|---|---|
| `SERVER_HOST` | Your server's IP or domain |
| `SERVER_USER` | SSH username |
| `SERVER_SSH_KEY` | Private SSH key |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DJANGO_SECRET_KEY` | — | Django secret key (change in production) |
| `OLLAMA_MODEL` | `Qwen 2.5` | Qwen model to use |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence transformer model |
| `RAG_TOP_K` | `5` | Number of chunks to retrieve |
| `RAG_MIN_SCORE` | `0.3` | Minimum relevance score threshold |
| `POSTGRES_PASSWORD` | `postgres` | Database password |

See `.env.example` for the full list.

---

## Useful Commands

```bash
# View logs
docker compose logs -f backend
docker compose logs -f ollama

# Restart a service
docker compose restart backend

# Run Django shell
docker compose exec backend python manage.py shell

# Pull a different model
docker exec more3zdenai_ollama ollama pull mistral

# Stop everything
docker compose down

# Full reset (deletes all data)
docker compose down -v
```

---

## Roadmap

- [ ] Streaming UI with real-time token display
- [ ] Multi-language support (Arabic, French, English)
- [ ] Admin dashboard for conversation analytics
- [ ] Support for PDF knowledge base documents
- [ ] Voice input / output interface
- [ ] Public deployment with SSL (Let's Encrypt)

---

## Author

**Azzeddine Abouaam** — [3zden.codes](https://3zden.codes) · [github.com/3zden](https://github.com/3zden) · [linkedin.com/in/3zden](https://linkedin.com/in/3zden)

---

## License

MIT License — feel free to fork and adapt for your own portfolio.
