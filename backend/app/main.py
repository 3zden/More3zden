"""
More3zdenAI — FastAPI application entrypoint.

On startup it creates the database schema and warms the FAISS vector store
(loading the embedding model + index, or building it from the knowledge base
on first run). RAG endpoints are mounted under /api.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cache import close_cache
from app.config import settings
from app.database import init_db
from app.rag import get_pipeline
from app.routes import chat, tts

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(asctime)s %(name)s %(message)s")
logger = logging.getLogger("api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up: creating DB schema...")
    await init_db()
    logger.info("Warming FAISS vector store (this builds the index on first run)...")
    await get_pipeline().warm()
    logger.info("Startup complete.")
    yield
    await close_cache()


app = FastAPI(title="More3zdenAI", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(tts.router, prefix="/api")
