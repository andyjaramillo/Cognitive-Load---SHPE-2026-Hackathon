from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


# ── Preferences ──────────────────────────────────────────────────────────── #

class UserPreferences(BaseModel):
    reading_level: Literal["simple", "standard", "detailed"] = "standard"
    font_choice: Literal["default", "lexend", "atkinson", "opendyslexic"] = "default"
    bionic_reading: bool = False
    line_height: float = Field(default=1.6, ge=1.0, le=3.0)
    letter_spacing: float = Field(default=0.0, ge=0.0, le=10.0)
    timer_length_minutes: int = Field(default=25, ge=5, le=60)
    focus_mode: bool = False
    granularity: Literal["micro", "normal", "broad"] = "normal"
    color_theme: Literal["calm", "dark", "high-contrast"] = "calm"
    # Session 5: identity + onboarding
    name: str = Field(default="there", max_length=100)
    communication_style: Literal["warm", "direct", "balanced"] = "balanced"
    onboarding_complete: bool = False
    walkthrough_complete: bool = False


# ── Task Decomposer ──────────────────────────────────────────────────────── #

class DecomposeRequest(BaseModel):
    goal: str = Field(..., min_length=3, max_length=500)
    granularity: Literal["micro", "normal", "broad"] = "normal"
    context: str = Field(default="", max_length=500)


class TaskStep(BaseModel):
    task_name: str = Field(..., max_length=200)
    duration_minutes: int = Field(..., ge=1, le=120)
    motivation_nudge: str = Field(..., max_length=500)
    due_date: str | None = None    # ISO 8601 string, e.g. "2026-03-21T00:00:00Z", or null
    due_label: str | None = None   # friendly label, e.g. "Friday", "due today", or null


class DecomposeResponse(BaseModel):
    steps: list[TaskStep]


# ── Summarise ────────────────────────────────────────────────────────────── #

class SummariseRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=100_000)
    reading_level: Literal["simple", "standard", "detailed"] = "standard"


# ── Sentence explanation ──────────────────────────────────────────────────── #

class ExplainRequest(BaseModel):
    sentence: str = Field(..., min_length=3, max_length=1000)


class ExplainResponse(BaseModel):
    reason: str
    simplified: str


# ── Nudge ────────────────────────────────────────────────────────────────── #

class NudgeRequest(BaseModel):
    task_name: str = Field(..., max_length=200)
    elapsed_minutes: int = Field(..., ge=0)


class NudgeResponse(BaseModel):
    message: str


# ── Document Upload ──────────────────────────────────────────────────────── #

class UploadResponse(BaseModel):
    extracted_text: str
    page_count: int
    filename: str
    blob_name: str | None = None   # None if Blob Storage not configured


# ── Sessions ─────────────────────────────────────────────────────────────── #

class SessionCreate(BaseModel):
    goal: str = Field(..., max_length=500)
    steps: list[TaskStep] = Field(..., max_length=50)


class SessionItem(BaseModel):
    id: str
    goal: str
    steps: list[TaskStep]
    created_at: str


# ── Chat ─────────────────────────────────────────────────────────────────── #

class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=10_000)


class ChatRequest(BaseModel):
    message: str = Field(default="", max_length=4_000)
    is_greeting: bool = False
    current_page: str = Field(default="home", max_length=50)
    conversation_history: list[ConversationMessage] = Field(
        default_factory=list, max_length=40
    )


# ── Task Groups (persistent tasks storage) ───────────────────────────────── #

class TaskGroupTask(BaseModel):
    id: str = Field(..., max_length=100)
    task_name: str = Field(..., max_length=200)
    description: str = Field(default="", max_length=1_000)
    duration_minutes: int = Field(default=15, ge=1, le=240)
    status: Literal["pending", "in_progress", "done", "skipped"] = "pending"
    due_date: str | None = None    # ISO 8601 string or null
    due_label: str | None = None   # friendly label or null


class TaskGroup(BaseModel):
    id: str
    group_name: str
    source: str = "chat"    # "chat" | "documents" | "manual"
    tasks: list[TaskGroupTask]
    created_at: str = ""


class TaskGroupsUpdate(BaseModel):
    groups: list[TaskGroup]


class TaskGroupsResponse(BaseModel):
    groups: list[TaskGroup]
