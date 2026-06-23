# More3zdenAI — Architecture & Flow

The backend is a **FastAPI** (async) RAG service. A Next.js UI streams answers
over Server-Sent Events; FastAPI retrieves context from a FAISS index built over
`knowledge_base/*.md` and generates grounded answers with a local **Ollama**
model (`qwen2.5:3b`). PostgreSQL stores conversation history; Redis caches answers.

## System flow

```mermaid
flowchart TD
    User([Visitor]) -->|types question| UI["Next.js Chat UI<br/>(EventSource / fetch)"]
    UI -->|HTTP / SSE| NGINX[Nginx reverse proxy :80]
    NGINX -->|/api/*| API["FastAPI :8000<br/>(uvicorn)"]

    subgraph Backend["FastAPI backend"]
        API --> ROUTES["routes/chat.py<br/>chat · stream · health · history"]
        ROUTES --> PIPE["RAGPipeline<br/>(async orchestrator)"]
        PIPE -->|"embed + top-k search<br/>(asyncio.to_thread)"| FAISS["FAISSVectorStore<br/>sentence-transformers + faiss"]
        PIPE -->|"generate / stream<br/>(httpx async)"| OLLAMA[("Ollama LLM<br/>qwen2.5:3b")]
        ROUTES -->|"answer cache<br/>(SHA-256 key)"| REDIS[("Redis")]
        ROUTES -->|"persist Conversation + Message<br/>(SQLAlchemy async)"| PG[("PostgreSQL")]
    end

    FAISS -.->|built once at startup from| KB["knowledge_base/*.md"]
    PIPE -->|grounded answer + sources| ROUTES
    ROUTES -->|"SSE: session → sources → tokens → done"| UI
    UI -->|renders bubbles + source chips| User
```

## Streaming request lifecycle

`GET /api/chat/stream/?question=...&session_id=...`

```mermaid
sequenceDiagram
    participant UI as Next.js UI
    participant API as FastAPI route
    participant DB as PostgreSQL
    participant VS as FAISS store
    participant LLM as Ollama

    UI->>API: GET /api/chat/stream/ (EventSource)
    API->>DB: get_or_create Conversation + save user Message
    API-->>UI: data: {type: session, session_id}
    API->>VS: retrieve(question)  (embed + top-k, in thread)
    VS-->>API: context chunks + sources (score ≥ RAG_MIN_SCORE)
    API-->>UI: data: {type: sources, sources}
    loop token stream
        API->>LLM: POST /api/generate (stream=true, httpx)
        LLM-->>API: token
        API-->>UI: data: {type: token, token}
    end
    API-->>UI: data: {type: done}
    API->>DB: save assistant Message (fresh session)
```

## Non-streaming path

`POST /api/chat/` does the same retrieval + generation synchronously, but first
checks the **Redis cache** (keyed by a normalized SHA-256 of the question). On a
hit it skips Ollama entirely; on a miss it caches the result for `RAG_CACHE_TTL`
seconds. Both turns are persisted to PostgreSQL.

## Key components

| Component | File | Responsibility |
|---|---|---|
| App entrypoint | `backend/app/main.py` | FastAPI app, CORS, lifespan (create schema + warm FAISS) |
| Settings | `backend/app/config.py` | env-driven config (pydantic-settings) |
| Routes | `backend/app/routes/chat.py` | the 4 endpoints, persistence, caching |
| Pipeline | `backend/app/rag/pipeline.py` | async retrieve → generate / stream |
| Vector store | `backend/app/rag/vector_store.py` | embeddings + FAISS (sync, run in threadpool) |
| LLM client | `backend/app/rag/llm_client.py` | async Ollama client (httpx), prompt + system prompt |
| Models | `backend/app/models.py` | `Conversation`, `Message` (SQLAlchemy async) |
| Cache | `backend/app/cache.py` | async Redis answer cache |

## Startup sequence

On boot the app lifespan (1) creates tables via `Base.metadata.create_all`, then
(2) warms the FAISS store — loading the embedding model and the index from
`/app/data/`, or **building it from the knowledge base on first run**. The
container reports healthy on `GET /api/health/` once Ollama is reachable and the
index is loaded.
