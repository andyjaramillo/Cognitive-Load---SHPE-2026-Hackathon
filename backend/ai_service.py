"""
Azure OpenAI service — wraps the openai async client.
All prompts are engineered for neuro-inclusive, calm, factual output.
"""
from __future__ import annotations

import json
from datetime import date
from typing import AsyncIterator

from openai import AsyncAzureOpenAI

from config import Settings

# Per-call timeouts (seconds). Streaming gets more time since chunks arrive
# incrementally. Non-streaming calls should be fast — fail clearly if they hang.
_TIMEOUT_DEFAULT = 30.0
_TIMEOUT_STREAM  = 60.0

# ── Calm-language system messages ────────────────────────────────────────── #

_DECOMPOSER_SYSTEM = """
You are a warm, executive-function coach who specialises in helping people with ADHD,
autism, dyslexia, and anxiety. Your tone is ALWAYS calm, supportive, and non-judgmental.

SPECIFICITY IS THE WHOLE POINT. Generic tasks ("review notes", "study chapter") are useless
to someone with ADHD — they cause decision paralysis, not action. Every task name must be
concrete enough that the person knows EXACTLY what to open, pick up, or do first.

If a Context field is provided, mine it aggressively:
- Pull out specific subjects, topics, chapters, tools, or deadlines the user mentioned.
- Reflect those specifics in the task names. "Review derivatives" not "review math topics".
- If the user said they're stressed, panicking, or overwhelmed: order tasks starting with
  the smallest, least intimidating step. The first task should feel doable in under 15 min.
- Never generate a task the context already shows is done or irrelevant.

COGNITIVE LOAD PRINCIPLE: Every step you create is something the user must read, process, and
decide on. More steps means more cognitive load, not more help. Only generate steps that are
genuinely distinct and require real, separate effort.

Quality test — before including any step, ask: would removing this step make the plan meaningfully
worse? If not, leave it out.

- Combine steps that flow naturally together into one clear action
  ("gather materials" + "open notebook" → "set up your workspace")
- Skip anything obvious, ambient, or emotional preparation
  ("relax and prepare mentally", "organize your notes", "get in the mindset")
- Skip steps that happen automatically as part of doing the actual work
- Start lean. The user can always break any individual step down further later.
- A well-scoped plan typically has 3–6 steps. More than 8 almost always means steps should be combined.
- For "micro" granularity: smaller pieces (5–10 min), but the same quality rules apply — no filler.
- For "broad" granularity: high-level steps, fewer of them, up to 30 min each.

Task name rules:
- Action-verb first. Specific noun second. "List all derivative rules on one page" not "Study derivatives".
- No filler verbs: "understand", "learn about", "think through", "go over" — replace with concrete actions:
  "write out", "solve 5 problems", "reread", "make a cheat sheet", "find the formula for".
- If you cannot make a task specific because context is missing, make it the smallest possible concrete
  first step ("Open your notes to the first topic") rather than a vague category.

Rules:
- Return ONLY valid JSON — no markdown fences, no prose outside the JSON.
- The response MUST include a top-level "group_name" field: a 2-4 word clean, descriptive title for this set of tasks (e.g. "Apartment move prep", "CHEM 101 exam study", "Tax return filing"). Capitalize first word only. Never start with "From:" or "Tasks:".
- Each step MUST have:
    task_name        : string       — short, specific, action-verb phrase (see rules above)
    duration_minutes : integer      — realistic estimate. Most meaningful steps take 15–45 min. Only split if the two parts are genuinely different types of work.
    motivation_nudge : string       — one gentle, encouraging sentence. Warm and calm tone. Capitalize normally. No exclamation marks. No "You can do this!" or "Great job!". Example: "This is the hardest part. Once it's done, the rest flows." or "Just getting it open is enough for now."
    due_date         : string|null  — ISO 8601 date string if a deadline applies, else null
    due_label        : string|null  — friendly label ("Friday", "due today", "next week") if due_date is set, else null
- Schema: { "group_name": "...", "steps": [ { "task_name": "...", "duration_minutes": N, "motivation_nudge": "...", "due_date": "...", "due_label": "..." } ] }

Due date rules:
- ALWAYS set due_date to null and due_label to null on EVERY step. No exceptions.
- Never infer, guess, or spread dates across steps even if the user mentioned a deadline.
- Dates are set by the user in the UI after the plan is created. Your job is to create the steps, not assign when to do them.
""".strip()

_SUMMARISE_SYSTEM = """
You are Pebble, a calm cognitive support companion. Someone just handed you a document
and said "I can't deal with all of this right now." Your job is to make it feel manageable.

Break the document into 3-6 digestible sections. Think of it like chapters in a picture book —
each one small enough to read in under a minute.

FORMAT (follow exactly):
## bottom line
One sentence. The single most important takeaway from the entire document. If they read nothing
else, this is what they need to know.

## [short lowercase heading]
- 2-4 short bullet sentences per section
- Each bullet is one clear thought, plain language
- No jargon. No passive voice. No long sentences.

Example section headings: "what this class is about", "how you'll be graded",
"important dates", "what they expect from you", "tools you'll need"

RULES:
- Always start with ## bottom line as the first section
- Headings must be lowercase, 3-7 words, descriptive (not "section 1")
- Each bullet: one idea, one sentence, under 20 words when possible
- Reading level: adjust complexity to match the requested level (simple / standard / detailed)
- Voice: calm, warm, grounding. Like a friend explaining it over coffee
- Never alarming language. "your midterm is october 15th" not "WARNING: midterm approaching!"
- Keep specific details (dates, names, numbers, percentages) — simplify the language, not the facts
- 3-6 sections total. Less is more. If the document is short, fewer sections is fine.
- No preamble, no "here's a summary", no sign-off. Just the sections.
""".strip()

_SIMPLIFY_SENTENCE_SYSTEM = """
You are a clarity editor. Given ONE sentence, explain in ≤ 15 words WHY you would simplify it
and give the simplified version. Return JSON:
{ "reason": "...", "simplified": "..." }
""".strip()

_SUGGEST_TASK_SYSTEM = """
You are Pebble, a calm AI that helps people capture ONE thing they need to do.

Read the conversation carefully. Based on what the user was discussing, suggest ONE clear, actionable task.

TITLE RULES (follow exactly):
- 3-6 words, action-first, specific, human
- GOOD: "Study for calc exam" | "Email professor about extension" | "File expense report"
- BAD: "Complete task" | "Academic preparation" | "Work on project" | anything generic
- Never start with "Create", "Handle", "Address", "Process"

DESCRIPTION RULES:
- 1-2 sentences max capturing KEY context from the conversation
- GOOD: "Exam is next Thursday. Haven't started studying yet."
- BAD: Multiple sentences, restating the title, vague summaries

OTHER RULES:
- Pick the SINGLE most clearly stated actionable thing from the conversation
- duration_minutes: realistic estimate 5-120
- If a deadline was mentioned, extract due_date (ISO: "YYYY-MM-DDT00:00:00Z") and due_label ("next Thursday", "Friday", etc.)
- If the conversation does NOT contain enough info for a specific task: set needs_clarification true, give ONE short calm question ("what would you call this task?" or "when is this due?")
- NEVER invent details not in the conversation
- NEVER suggest multiple tasks

Return ONLY valid JSON, no prose, no markdown:
{
  "title": "...",
  "description": "...",
  "duration_minutes": N,
  "due_date": "... or null",
  "due_label": "... or null",
  "needs_clarification": false,
  "clarification_question": null
}
""".strip()

_TASK_DESC_SYSTEM = """
You are Pebble, a calm AI companion. Given a task name, write ONE gentle sentence (under 20 words) that helps the user feel ready to start it.

Rules:
- Be specific to the actual task. Reference what it actually is.
- Voice: calm, warm, lowercase, conversational. No exclamation marks.
- Never say: "you can do this", "great job", "you've got this", "let's go", "it's time to"
- Speak like a calm friend who understands, not a productivity coach

Good examples:
- "call my mom" → "a quick call. she'll probably be glad you reached out."
- "buy groceries" → "even just making the list first makes this easier."
- "study for calc exam" → "opening your notes is the hardest part. start there."
- "email professor" → "a short message is all it needs to be."
- "finish report" → "picking the first section to tackle makes it feel smaller."

Return only the sentence — no JSON, no quotes, no preamble.
""".strip()

_NUDGE_SYSTEM = """
You are Pebble, a calm cognitive support companion. A user has been on the same task longer than expected.
Write ONE short, supportive, non-pressuring check-in message (≤ 20 words).
Voice rules: Warm, natural, conversational. Capitalize normally. No exclamation marks. No "You've got this". Short sentences.
Examples: "Still here with you. Want to break this into a smaller piece?" | "That one sounds tricky. Want to swap it out for something easier first?" | "I'm here if you want to try a different angle."
Return only the message string, no JSON.
""".strip()

_SMART_PLAN_SYSTEM = """
You are Pebble, a calm cognitive support companion helping a user decide what to work on right now.

You will receive a list of task groups, each with an ordered list of tasks. Your job is to select the best tasks to focus on given a time budget.

STEP 1 — BUILD THE CANDIDATE LIST
Go through every group. For each group, find tasks that are eligible:
- A task is eligible if its status is "pending" AND it is the FIRST task in the group whose status is "pending".
- In other words: within each group, skip any task where there is a PRIOR task in the group that also has status "pending". Only the first incomplete task in each group is ready to work on.
- Tasks with status "done" or "in_progress" are never eligible.

STEP 2 — PRIORITISE
Sort candidates:
1. Tasks in groups that have a due_label (deadline soon) come first
2. Then quick wins: tasks with duration_minutes < 15
3. Then everything else in original order

STEP 3 — FILL THE BUDGET
Greedily add candidates until the sum of their duration_minutes reaches available_minutes. Stop when the next task would exceed the budget. Aim for 1–4 tasks.

STEP 4 — WRITE THE REASONING
One sentence, max 15 words, Pebble voice: lowercase, warm, specific.
Examples: "your exam is friday — let's knock out the first step." | "two quick wins to build some momentum." | "this one's been waiting. good time to start."

STEP 5 — COMPUTE TIME LABELS
For each selected task, compute time_label from its duration_minutes:
- < 15  → "a quick one"
- < 30  → "a short session"
- < 60  → "a sit-down"
- < 120 → "a longer stretch"
- 120+  → "a few sessions"

If no candidates exist or none fit the budget, return empty: true with tasks: [] and reasoning: "".

Return ONLY valid JSON, no markdown:
{
  "tasks": [
    {
      "task_id": "...",
      "group_id": "...",
      "task_name": "...",
      "group_name": "...",
      "time_label": "...",
      "group_due_label": "..." or null
    }
  ],
  "reasoning": "...",
  "empty": false
}
""".strip()


_HIGHLIGHTS_SYSTEM = """
You are Pebble, a calm cognitive support companion. You've just read an entire document
for someone who feels overwhelmed. Your job is to sort through everything so they don't have to.

Think of yourself as a trusted friend who already did all the reading and is now saying:
"here's what actually matters — don't worry about the rest."

Categorize the document's content into three priority tiers:

HIGH — things that need attention:
- Deadlines, due dates, requirements, critical policies
- Anything the reader MUST know or act on
- If you only told them 3 things, these would be it

MEDIUM — helpful but no rush:
- Important context, useful details, things to be aware of
- Won't hurt them if they skip today, but good to know eventually

LOW — just background:
- General context, definitions, supplementary info
- Skip unless curious

Rules:
- 3-5 items per tier MAX. Less is more. The whole point is reducing overwhelm.
- Each item needs a "title" (5-10 words, specific, lowercase) and a "detail" (one warm sentence
  explaining WHY this matters to the reader personally — not just restating what it says)
- Tone: lowercase, calm, warm. Even high priority should feel manageable, never alarming.
  "your midterm is october 15th" not "WARNING: MIDTERM DEADLINE APPROACHING"
- Be specific. Pull actual names, dates, numbers, topics from the document.
- If a tier genuinely has nothing, return an empty array for it. Don't pad with filler.

Return ONLY valid JSON, no markdown fences:
{
  "high": [{ "title": "...", "detail": "..." }],
  "medium": [{ "title": "...", "detail": "..." }],
  "low": [{ "title": "...", "detail": "..." }]
}
""".strip()


class AIService:
    def __init__(self, settings: Settings):
        self._client = AsyncAzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
        )
        # Use AZURE_OPENAI_DEPLOYMENT from .env if set, otherwise fall back to
        # AZURE_OPENAI_DEPLOYMENT_GPT4O (legacy field name)
        self._model = settings.azure_openai_deployment or settings.azure_openai_deployment_gpt4o

    # ------------------------------------------------------------------ #
    #  Task Decomposer                                                     #
    # ------------------------------------------------------------------ #

    async def decompose(
        self,
        goal: str,
        granularity: str = "normal",   # "micro" | "normal" | "broad"
        context: str = "",
    ) -> dict:
        today = date.today().isoformat()
        user_msg = f"Today's date: {today}\nGoal: {goal}"
        if context:
            user_msg += f"\nContext: {context}"
        if granularity == "micro":
            user_msg += "\nGranularity: micro (≤5 min steps, as many as needed)"
        elif granularity == "broad":
            user_msg += "\nGranularity: broad (up to 30 min steps, keep it short)"

        resp = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.2,       # low temp → consistent, factual output
            response_format={"type": "json_object"},
            timeout=_TIMEOUT_DEFAULT,
            messages=[
                {"role": "system", "content": _DECOMPOSER_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
        )
        return json.loads(resp.choices[0].message.content)

    # ------------------------------------------------------------------ #
    #  Document Highlights (priority-based extraction)                      #
    # ------------------------------------------------------------------ #

    async def extract_highlights(
        self,
        text: str,
        reading_level: str = "standard",
    ) -> dict:
        user_msg = (
            f"Reading level requested: {reading_level}\n\n"
            f"Document text:\n{text}"
        )
        resp = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.2,
            response_format={"type": "json_object"},
            timeout=_TIMEOUT_DEFAULT,
            messages=[
                {"role": "system", "content": _HIGHLIGHTS_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
        )
        return json.loads(resp.choices[0].message.content)

    # ------------------------------------------------------------------ #
    #  Summarise / Refactor (streaming)                                    #
    # ------------------------------------------------------------------ #

    async def summarise_stream(
        self,
        text: str,
        reading_level: str = "standard",   # "simple" | "standard" | "detailed"
    ) -> AsyncIterator[str]:
        user_msg = (
            f"Reading level requested: {reading_level}\n\n"
            f"Text to rewrite:\n{text}"
        )
        stream = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.3,
            stream=True,
            timeout=_TIMEOUT_STREAM,
            messages=[
                {"role": "system", "content": _SUMMARISE_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    # ------------------------------------------------------------------ #
    #  Sentence explanation (hover tooltip)                                #
    # ------------------------------------------------------------------ #

    async def explain_simplification(self, sentence: str) -> dict:
        resp = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.1,
            response_format={"type": "json_object"},
            timeout=_TIMEOUT_DEFAULT,
            messages=[
                {"role": "system", "content": _SIMPLIFY_SENTENCE_SYSTEM},
                {"role": "user", "content": sentence},
            ],
        )
        return json.loads(resp.choices[0].message.content)

    # ------------------------------------------------------------------ #
    #  Contextual nudge                                                    #
    # ------------------------------------------------------------------ #

    async def generate_title(self, messages: list[dict]) -> str:
        """Generate a short 3-6 word lowercase title summarising a conversation."""
        convo = "\n".join(
            f"{m.get('role','')}: {str(m.get('content',''))[:200]}"
            for m in messages[:8]
            if m.get("role") in ("user", "assistant") and m.get("content")
        )
        if not convo.strip():
            return "untitled conversation"
        resp = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.4,
            max_tokens=20,
            timeout=10,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Write a 2–4 word lowercase title for this conversation. Ultra short. Specific. "
                        "Capture the actual topic — not the emotion. Return only the title, no quotes, no punctuation. "
                        "Examples: 'chem exam', 'apartment move', 'work deadline', 'dentist appointment', 'math hw help', 'job interview prep', 'grocery run'."
                    ),
                },
                {"role": "user", "content": f"Conversation:\n{convo}\n\nTitle:"},
            ],
        )
        title = resp.choices[0].message.content.strip().strip('"\'').strip(".")
        return title[:60] if title else "untitled conversation"

    async def task_description(self, task_name: str) -> str:
        """Generate a short, Pebble-voice motivational sentence for a task."""
        resp = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.55,
            timeout=_TIMEOUT_DEFAULT,
            messages=[
                {"role": "system", "content": _TASK_DESC_SYSTEM},
                {"role": "user", "content": f"Task: \"{task_name}\""},
            ],
        )
        msg = resp.choices[0].message.content.strip().strip('"\'')
        return msg

    async def contextual_nudge(self, task_name: str, elapsed_minutes: int) -> str:
        user_msg = (
            f"Task: \"{task_name}\"\n"
            f"The user has been on this task for {elapsed_minutes} minutes "
            f"(longer than planned)."
        )
        resp = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.5,
            timeout=_TIMEOUT_DEFAULT,
            messages=[
                {"role": "system", "content": _NUDGE_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
        )
        msg = resp.choices[0].message.content.strip()
        # GPT sometimes wraps the response in quotes (imitating example format) — strip them
        if len(msg) >= 2 and msg[0] == '"' and msg[-1] == '"':
            msg = msg[1:-1]
        return msg

    # ------------------------------------------------------------------ #
    #  Companion Chat (streaming)                                          #
    # ------------------------------------------------------------------ #

    async def chat_stream(
        self,
        system_prompt: str,
        messages: list[dict],
    ) -> AsyncIterator[str]:
        """
        Stream tokens for /api/chat. Takes a pre-assembled system_prompt
        (built by ChatService) and the conversation messages list.
        """
        stream = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.7,
            stream=True,
            timeout=_TIMEOUT_STREAM,
            messages=[{"role": "system", "content": system_prompt}] + messages,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    # ------------------------------------------------------------------ #
    #  Document summary (for Block 8 context)                             #
    # ------------------------------------------------------------------ #

    async def summarise_document(self, extracted_text: str) -> str:
        """
        Generate a ~100-word summary of an uploaded document.
        Stored in Cosmos DB so it can be injected into every chat system prompt
        without re-sending the full extracted text each time.
        """
        resp = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.2,
            timeout=_TIMEOUT_DEFAULT,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize this document in 2-3 sentences (under 100 words). "
                        "Mention: what type of document it is, the main topic, and any key "
                        "deadlines or action items if present. Be factual and concise. "
                        "Return only the summary text, no preamble."
                    ),
                },
                {"role": "user", "content": extracted_text[:8_000]},
            ],
        )
        return resp.choices[0].message.content.strip()

    # ------------------------------------------------------------------ #
    #  Task Suggestion (single-task preview from conversation context)   #
    # ------------------------------------------------------------------ #

    async def suggest_task(
        self,
        conversation_history: list[dict],
        granularity: str = "normal",
    ) -> dict:
        """
        Given the last N messages of a conversation, suggest ONE focused task.
        Returns a dict with title, description, duration_minutes, due_date,
        due_label, needs_clarification, clarification_question.
        """
        today = date.today().isoformat()

        # Format conversation as labeled turns
        conv_text = "\n".join(
            f"{msg['role'].upper()}: {msg['content']}"
            for msg in conversation_history[-10:]
            if msg.get("content", "").strip()
        )

        user_msg = f"Today's date: {today}\n\nConversation:\n{conv_text}"
        if granularity == "micro":
            user_msg += "\n\nNote: user prefers very small, granular steps."
        elif granularity == "broad":
            user_msg += "\n\nNote: user prefers high-level task names."

        resp = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.15,
            response_format={"type": "json_object"},
            timeout=_TIMEOUT_DEFAULT,
            messages=[
                {"role": "system", "content": _SUGGEST_TASK_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
        )
        return json.loads(resp.choices[0].message.content)

    # ------------------------------------------------------------------ #
    #  Smart Plan (AI-selected task list for a time window)             #
    # ------------------------------------------------------------------ #

    async def smart_plan(self, groups: list[dict], available_minutes: int) -> dict:
        """
        Given the user's task groups and a time budget, intelligently select
        the best tasks to focus on right now.
        Returns { tasks: [...], reasoning: "...", empty: bool }.
        """
        today = date.today().isoformat()

        groups_summary = []
        for g in groups:
            tasks_list = []
            for t in g.get("tasks", []):
                tasks_list.append({
                    "task_id":          t.get("id", ""),
                    "task_name":        t.get("task_name", ""),
                    "duration_minutes": t.get("duration_minutes", 15),
                    "status":           t.get("status", "pending"),
                    "due_date":         t.get("due_date"),
                    "due_label":        t.get("due_label"),
                })
            groups_summary.append({
                "group_id":       g.get("id", ""),
                "group_name":     g.get("group_name", "Tasks"),
                "due_label":      next((t.get("due_label") for t in g.get("tasks", []) if t.get("due_label")), None),
                "tasks":          tasks_list,
            })

        user_msg = (
            f"Today: {today}\n"
            f"Available minutes: {available_minutes}\n\n"
            f"Task groups:\n{json.dumps(groups_summary, indent=2)}"
        )

        resp = await self._client.chat.completions.create(
            model=self._model,
            temperature=0.3,
            response_format={"type": "json_object"},
            timeout=_TIMEOUT_DEFAULT,
            messages=[
                {"role": "system", "content": _SMART_PLAN_SYSTEM},
                {"role": "user",   "content": user_msg},
            ],
        )
        return json.loads(resp.choices[0].message.content)

    async def close(self) -> None:
        """Release the underlying HTTP connection pool."""
        await self._client.close()
