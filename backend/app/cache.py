"""
Redis answer cache (async). Stores serialized RAG results keyed by a stable
SHA-256 of the question, so repeat questions return instantly.
"""
import hashlib
import json
from typing import Any

import redis.asyncio as redis

from app.config import settings

_client: redis.Redis | None = None


def get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(settings.redis_url, decode_responses=True)
    return _client


def cache_key(question: str) -> str:
    digest = hashlib.sha256(question.strip().lower().encode()).hexdigest()[:32]
    return f"rag:{digest}"


async def cache_get(key: str) -> dict[str, Any] | None:
    try:
        raw = await get_client().get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def cache_set(key: str, value: dict[str, Any], ttl: int) -> None:
    try:
        await get_client().set(key, json.dumps(value), ex=ttl)
    except Exception:
        pass


async def close_cache() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
