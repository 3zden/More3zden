"""
API routes — mounted under /api.
- POST /api/chat/                       → RAG query (non-streaming, persisted, cached)
- GET  /api/chat/stream/                → RAG query (SSE streaming, persisted)
- GET  /api/health/                     → service health
- GET  /api/conversation/{session_id}/  → conversation history
"""
import json
import logging
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.cache import cache_get, cache_key, cache_set
from app.config import settings
from app.database import AsyncSessionLocal, get_session
from app.models import Conversation, Message
from app.rag import get_pipeline
from app.schemas import ChatRequest, ChatResponse, ConversationOut

logger = logging.getLogger("api")
router = APIRouter()


async def _get_or_create_conversation(
    db: AsyncSession, session_id: Optional[uuid.UUID], request: Request
) -> Conversation:
    if session_id is not None:
        result = await db.execute(
            select(Conversation).where(Conversation.session_id == session_id)
        )
        conv = result.scalar_one_or_none()
        if conv is not None:
            return conv

    conv = Conversation(
        session_id=session_id or uuid.uuid4(),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:512],
    )
    db.add(conv)
    await db.flush()  # populate conv.id / session_id
    return conv


async def _add_message(db: AsyncSession, conv: Conversation, role: str, content: str, **meta):
    db.add(Message(conversation_id=conv.id, role=role, content=content, **meta))
    conv.message_count += 1


@router.post("/chat/", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request, db: AsyncSession = Depends(get_session)):
    conv = await _get_or_create_conversation(db, req.session_id, request)
    await _add_message(db, conv, "user", req.question)

    start = time.time()
    pipeline = get_pipeline()
    key = cache_key(req.question)

    cached = await cache_get(key)
    if cached:
        result = {**cached, "cached": True}
    else:
        rag = await pipeline.query(req.question)
        result = {
            "answer": rag.answer,
            "sources": rag.sources,
            "model": rag.model,
            "latency_s": rag.latency_s,
            "error": rag.error,
            "cached": False,
        }
        if not rag.error:
            await cache_set(key, result, settings.rag_cache_ttl)

    latency_ms = int((time.time() - start) * 1000)

    await _add_message(
        db,
        conv,
        "assistant",
        result["answer"],
        sources=result.get("sources", []),
        cached=result.get("cached", False),
        latency_ms=latency_ms,
        model_name=result.get("model", ""),
    )
    await db.commit()

    logger.info("Chat | session=%s latency=%dms cached=%s", conv.session_id, latency_ms, result.get("cached"))

    return ChatResponse(
        answer=result["answer"],
        sources=result.get("sources", []),
        session_id=conv.session_id,
        cached=result.get("cached", False),
        latency_ms=latency_ms,
        model=result.get("model", ""),
        error=result.get("error"),
    )


@router.get("/chat/stream/")
async def chat_stream(
    request: Request,
    question: str = Query(..., min_length=1),
    session_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_session),
):
    question = question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    # Persist the user turn up front and capture the conversation id.
    conv = await _get_or_create_conversation(db, session_id, request)
    await _add_message(db, conv, "user", question)
    await db.commit()
    conv_id, conv_session = conv.id, conv.session_id

    pipeline = get_pipeline()

    async def event_stream():
        yield "retry: 3000\n\n"
        # Tell the client which conversation this belongs to.
        yield f"data: {json.dumps({'type': 'session', 'session_id': str(conv_session)})}\n\n"

        answer_parts: list[str] = []
        sources: list = []
        start = time.time()
        model = pipeline.llm_client.model

        async for event in pipeline.stream(question):
            if event["type"] == "sources":
                sources = event["sources"]
            elif event["type"] == "token":
                answer_parts.append(event["token"])
            yield f"data: {json.dumps(event)}\n\n"

        # Persist the assistant turn with a fresh session (request session is closed).
        latency_ms = int((time.time() - start) * 1000)
        async with AsyncSessionLocal() as s:
            s.add(
                Message(
                    conversation_id=conv_id,
                    role="assistant",
                    content="".join(answer_parts),
                    sources=sources,
                    cached=False,
                    latency_ms=latency_ms,
                    model_name=model,
                )
            )
            result = await s.execute(select(Conversation).where(Conversation.id == conv_id))
            c = result.scalar_one_or_none()
            if c is not None:
                c.message_count += 1
            await s.commit()

    response = StreamingResponse(event_stream(), media_type="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    return response


@router.get("/health/")
async def health():
    pipeline = get_pipeline()
    ollama_ok = await pipeline.llm_client.is_healthy()
    faiss_ok = pipeline._vector_store is not None and pipeline._vector_store.index is not None

    return JSONResponse(
        status_code=200 if ollama_ok else 503,
        content={
            "status": "ok" if ollama_ok else "degraded",
            "services": {
                "fastapi": "ok",
                "ollama": "ok" if ollama_ok else "unreachable",
                "faiss": "ok" if faiss_ok else "not_loaded",
            },
        },
    )


@router.get("/conversation/{session_id}/", response_model=ConversationOut)
async def conversation_history(session_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.session_id == session_id)
        .options(selectinload(Conversation.messages))
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv
