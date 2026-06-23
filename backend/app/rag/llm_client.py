"""
Async Ollama LLM Client (httpx).
Handles prompt engineering, context injection, and streaming for local
Ollama models. Answer caching is handled at the route layer (Redis).
"""
import json
import os
import time
from typing import AsyncGenerator, List

import httpx

# ── Configuration ──────────────────────────────────────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "60"))

# ── System Prompt ──────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are More3zdenAI, the personal AI assistant for Azzeddine's developer portfolio.
Your role is to help visitors learn about Azzeddine's skills, projects, experience, and services.

Guidelines:
- Be friendly, concise, and professional.
- Answer only based on the provided context. If the answer is not in the context, say so honestly.
- Keep responses under 200 words unless a detailed explanation is explicitly requested.
- Use bullet points for lists of skills, technologies, or features.
- Always refer to Azzeddine in the third person (e.g., "Azzeddine has experience with...").
- Do NOT make up projects, skills, or experiences not mentioned in the context.
- If asked about availability or hiring, be encouraging and direct visitors to the contact section.
"""

RAG_PROMPT_TEMPLATE = """Use the following context from Azzeddine's portfolio to answer the question.

CONTEXT:
{context}

QUESTION: {question}

Answer clearly and concisely based only on the context above:"""

_GEN_OPTIONS = {"temperature": 0.3, "top_p": 0.9, "num_predict": 512}


class OllamaClient:
    def __init__(
        self,
        base_url: str = OLLAMA_BASE_URL,
        model: str = OLLAMA_MODEL,
        timeout: int = OLLAMA_TIMEOUT,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def build_prompt(self, question: str, context_chunks: List[str]) -> str:
        context = "\n\n---\n\n".join(context_chunks)
        return RAG_PROMPT_TEMPLATE.format(context=context, question=question)

    async def is_healthy(self) -> bool:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{self.base_url}/api/tags", timeout=5)
                return resp.status_code == 200
        except Exception:
            return False

    async def generate(self, question: str, context_chunks: List[str]) -> dict:
        prompt = self.build_prompt(question, context_chunks)
        payload = {
            "model": self.model,
            "system": SYSTEM_PROMPT,
            "prompt": prompt,
            "stream": False,
            "options": _GEN_OPTIONS,
        }

        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(f"{self.base_url}/api/generate", json=payload)
                resp.raise_for_status()
                data = resp.json()
            return {
                "response": data.get("response", "").strip(),
                "model": self.model,
                "latency_s": round(time.time() - start, 3),
            }
        except httpx.TimeoutException:
            return {"error": "LLM timeout. Please try again.", "model": self.model}
        except httpx.ConnectError:
            return {"error": "Cannot connect to Ollama. Is it running?", "model": self.model}
        except Exception as e:  # noqa: BLE001
            return {"error": str(e), "model": self.model}

    async def stream(
        self, question: str, context_chunks: List[str]
    ) -> AsyncGenerator[str, None]:
        prompt = self.build_prompt(question, context_chunks)
        payload = {
            "model": self.model,
            "system": SYSTEM_PROMPT,
            "prompt": prompt,
            "stream": True,
            "options": _GEN_OPTIONS,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/api/generate", json=payload
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        chunk = json.loads(line)
                        token = chunk.get("response", "")
                        if token:
                            yield token
                        if chunk.get("done"):
                            break
        except Exception as e:  # noqa: BLE001
            yield f"\n[Error: {str(e)}]"


# ── Singleton ────────────────────────────────────────────────────────────────
_ollama_client: OllamaClient | None = None


def get_ollama_client() -> OllamaClient:
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = OllamaClient()
    return _ollama_client
