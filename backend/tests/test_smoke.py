"""
Lightweight smoke tests — no DB, Redis, Ollama, or embedding model required.
Covers the pure-Python pieces: chunking, prompt building, cache keys, config,
and that the FastAPI app constructs with the expected routes.
"""
from app.cache import cache_key
from app.config import settings
from app.main import app
from app.rag.llm_client import OllamaClient
from app.rag.loader import split_into_chunks


def test_chunker_splits_on_headers():
    text = "# Intro\nHello world.\n\n## Skills\nPython and Rust."
    chunks = split_into_chunks(text, source="portfolio")
    sections = {c.section for c in chunks}
    assert "Intro" in sections
    assert "Skills" in sections
    assert all(c.source == "portfolio" for c in chunks)


def test_cache_key_is_stable_and_normalized():
    assert cache_key("Hello?") == cache_key("  hello?  ")
    assert cache_key("a") != cache_key("b")
    assert cache_key("x").startswith("rag:")


def test_prompt_includes_context_and_question():
    prompt = OllamaClient().build_prompt("What stack?", ["[Skills]\nPython"])
    assert "What stack?" in prompt
    assert "Python" in prompt


def test_database_url_is_asyncpg():
    assert settings.database_url.startswith("postgresql+asyncpg://")


def test_app_exposes_expected_routes():
    paths = {r.path for r in app.routes}
    assert "/api/chat/" in paths
    assert "/api/chat/stream/" in paths
    assert "/api/health/" in paths
    assert "/api/conversation/{session_id}/" in paths
