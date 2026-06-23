"""Pydantic request/response schemas."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    session_id: uuid.UUID | None = None
    stream: bool = False


class Source(BaseModel):
    section: str
    source: str
    score: float
    preview: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source] = []
    session_id: uuid.UUID
    cached: bool = False
    latency_ms: int | None = None
    model: str = ""
    error: str | None = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    sources: list = []
    cached: bool = False
    latency_ms: int | None = None
    model_name: str = ""
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    message_count: int
    messages: list[MessageOut] = []
