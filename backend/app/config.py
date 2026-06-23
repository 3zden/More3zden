"""
Application settings — loaded from environment variables (.env).
Single source of truth for configuration across the FastAPI app.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )

    # ── PostgreSQL ──────────────────────────────────────────────────────────
    postgres_db: str = "more3zdenai"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_host: str = "db"
    postgres_port: str = "5432"

    # ── Redis ───────────────────────────────────────────────────────────────
    redis_url: str = "redis://redis:6379/0"

    # ── Ollama / LLM ────────────────────────────────────────────────────────
    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5:3b"
    ollama_timeout: int = 60

    # ── RAG / FAISS ─────────────────────────────────────────────────────────
    embedding_model: str = "all-MiniLM-L6-v2"
    faiss_index_path: str = "/app/data/faiss.index"
    faiss_chunks_path: str = "/app/data/chunks.pkl"
    knowledge_base_dir: str = "/app/knowledge_base"
    rag_top_k: int = 5
    rag_min_score: float = 0.3
    rag_cache_ttl: int = 3600

    # ── CORS ────────────────────────────────────────────────────────────────
    cors_allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
