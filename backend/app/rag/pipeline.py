"""
Async RAG Pipeline Orchestrator
Ties together: FAISS retrieval → context building → Ollama generation.
Single entry point used by the FastAPI routes.
"""
import asyncio
import os
from dataclasses import dataclass, field
from typing import AsyncGenerator, List, Optional, Tuple

from .llm_client import OllamaClient, get_ollama_client
from .vector_store import FAISSVectorStore, get_vector_store

# ── Configuration ──────────────────────────────────────────────────────────────
TOP_K_RETRIEVAL = int(os.getenv("RAG_TOP_K", "5"))
MIN_RELEVANCE_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.3"))

NO_CONTEXT_MESSAGE = (
    "I don't have enough information to answer that question. "
    "Try asking about Azzeddine's skills, projects, or experience."
)


@dataclass
class RAGResponse:
    answer: str
    sources: List[dict] = field(default_factory=list)
    cached: bool = False
    model: str = ""
    latency_s: Optional[float] = None
    error: Optional[str] = None


class RAGPipeline:
    def __init__(
        self,
        vector_store: Optional[FAISSVectorStore] = None,
        llm_client: Optional[OllamaClient] = None,
    ):
        self._vector_store = vector_store
        self._llm_client = llm_client

    @property
    def vector_store(self) -> FAISSVectorStore:
        if self._vector_store is None:
            self._vector_store = get_vector_store()
        return self._vector_store

    @property
    def llm_client(self) -> OllamaClient:
        if self._llm_client is None:
            self._llm_client = get_ollama_client()
        return self._llm_client

    async def warm(self) -> None:
        """Force the (CPU-bound) vector store + embedding model to load."""
        await asyncio.to_thread(lambda: self.vector_store)

    # ── Retrieve relevant context ─────────────────────────────────────────────
    async def retrieve(self, question: str) -> Tuple[List[str], List[dict]]:
        results = await asyncio.to_thread(
            self.vector_store.search, question, TOP_K_RETRIEVAL
        )

        context_chunks: List[str] = []
        sources: List[dict] = []
        for chunk, score in results:
            if score < MIN_RELEVANCE_SCORE:
                continue
            context_chunks.append(f"[{chunk.section}]\n{chunk.content}")
            sources.append(
                {
                    "section": chunk.section,
                    "source": chunk.source,
                    "score": round(score, 4),
                    "preview": chunk.content[:120] + "...",
                }
            )
        return context_chunks, sources

    # ── Non-streaming RAG ─────────────────────────────────────────────────────
    async def query(self, question: str) -> RAGResponse:
        context_chunks, sources = await self.retrieve(question)

        if not context_chunks:
            return RAGResponse(answer=NO_CONTEXT_MESSAGE, model=self.llm_client.model)

        result = await self.llm_client.generate(question, context_chunks)
        if "error" in result:
            return RAGResponse(
                answer=result["error"],
                sources=sources,
                model=self.llm_client.model,
                error=result["error"],
            )
        return RAGResponse(
            answer=result["response"],
            sources=sources,
            model=result.get("model", ""),
            latency_s=result.get("latency_s"),
        )

    # ── Streaming RAG (yields structured events) ──────────────────────────────
    async def stream(self, question: str) -> AsyncGenerator[dict, None]:
        context_chunks, sources = await self.retrieve(question)

        if not context_chunks:
            yield {"type": "token", "token": NO_CONTEXT_MESSAGE}
            yield {"type": "done"}
            return

        yield {"type": "sources", "sources": sources}
        async for token in self.llm_client.stream(question, context_chunks):
            yield {"type": "token", "token": token}
        yield {"type": "done"}


# ── Singleton ────────────────────────────────────────────────────────────────
_pipeline: RAGPipeline | None = None


def get_pipeline() -> RAGPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = RAGPipeline()
    return _pipeline
