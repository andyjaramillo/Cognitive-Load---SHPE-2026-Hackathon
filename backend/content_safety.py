"""
Azure AI Content Safety service for NeuroFocus.

Two-layer screening architecture:
  Layer 1 — Local regex: detects cognitive-pressure language (urgency, guilt,
             overwhelm, catastrophizing, perfectionism, shame, comparison).
             Runs instantly with no network call.
  Layer 2 — Azure AI Content Safety API: detects harmful content across four
             categories (Hate, SelfHarm, Sexual, Violence).

Context-aware: user intent text (goals, task names) goes through both layers.
Document text (paste-for-simplification) goes through Azure API only — a legal
contract naturally contains "must" and "required to" and should not be flagged
as overwhelming.

Graceful degradation: if CONTENT_SAFETY_ENDPOINT / CONTENT_SAFETY_KEY are not
configured, Layer 2 is skipped with a warning. App remains functional.
"""
from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)


# ── Azure API limits ──────────────────────────────────────────────────────── #

_AZURE_MAX_CHARS = 10_000  # Azure Content Safety hard limit per request

# Separate severity thresholds for input vs output.
# Input: conservative (2/6) — user text may signal real distress.
# Output: moderate (4/6) — AI is already prompt-engineered for calm tone;
#         threshold 2 would flag legitimate responses about difficult topics.
_INPUT_SEVERITY_THRESHOLD = 2
_OUTPUT_SEVERITY_THRESHOLD = 4


# ── Cognitive-pressure pattern definitions ────────────────────────────────── #
# These are specific to neurodiverse users — anxiety triggers documented in
# ADHD, autism, and dyslexia research. Azure Content Safety does not detect
# these; this is NeuroFocus's custom Responsible AI layer.

_URGENCY = re.compile(
    r"\b("
    r"you must immediately|right now|a\.?s\.?a\.?p\.?|urgently?|"
    r"hurry up|do it now|drop everything|time is running out|"
    r"last chance|must be done now|running out of time|"
    r"behind schedule|no more time|overdue|by end of day|"
    r"cannot wait|can't wait any longer|needs to happen now"
    r")\b",
    re.IGNORECASE,
)

_GUILT = re.compile(
    r"\b("
    r"you should have|you failed|your fault|you didn't|you never|"
    r"you always mess|you are (a failure|useless|hopeless|incompetent)|"
    r"how could you|i('m| am) disappointed|you let (me|us|everyone) down|"
    r"you ruined|you're the problem|you are to blame|you messed up|"
    r"you keep failing|you never get it right"
    r")\b",
    re.IGNORECASE,
)

_CATASTROPHIZING = re.compile(
    r"\b("
    r"everything is falling apart|it('s| is) all ruined|nothing is working|"
    r"everything went wrong|it('s| is) hopeless|there('s| is) no point|"
    r"nothing will ever|it('s| is) all over|i('ve| have) ruined everything|"
    r"can't do anything right|complete disaster|total failure"
    r")\b",
    re.IGNORECASE,
)

_PERFECTIONISM = re.compile(
    r"\b("
    r"(it('s| is)|this is) not good enough|has to be perfect|"
    r"can't make (any )?mistakes?|must be flawless|needs to be perfect|"
    r"(it('s| is)|this is) never good enough|nothing (i|we) do is good enough|"
    r"has to be exactly right|not allowed to fail"
    r")\b",
    re.IGNORECASE,
)

_SHAME = re.compile(
    r"\b("
    r"so embarrassing|how embarrassing|pathetic|you('re| are) pathetic|"
    r"should be ashamed|what('s| is) wrong with (you|me)|"
    r"(i('m| am)|you('re| are)) such a (loser|failure|idiot|mess)|"
    r"no one (else )?would|only (a )?idiot"
    r")\b",
    re.IGNORECASE,
)

_COMPARISON = re.compile(
    r"\b("
    r"everyone else (can|does|is|has)|why can't you just|"
    r"you('re| are) the only one (who )?can't|"
    r"(everyone|everybody) else manages|other people don't have (this )?problem|"
    r"normal people (can|do|would)|why is it so hard for you"
    r")\b",
    re.IGNORECASE,
)

# Overwhelm: too many imperatives in a single message
_DEMANDS = re.compile(
    r"\b(must|need to|have to|required? to|you must|you need|you have to|"
    r"you are required|you should|you ought to|you('re| are) expected to)\b",
    re.IGNORECASE,
)
_OVERWHELM_THRESHOLD = 4  # 4 or more demand phrases signals overwhelm


# ── Flag categories (returned to frontend for context-aware UI) ───────────── #

class FlagCategory:
    URGENCY = "cognitive_pressure_urgency"
    GUILT = "cognitive_pressure_guilt"
    CATASTROPHIZING = "cognitive_pressure_catastrophizing"
    PERFECTIONISM = "cognitive_pressure_perfectionism"
    SHAME = "cognitive_pressure_shame"
    COMPARISON = "cognitive_pressure_comparison"
    OVERWHELM = "cognitive_pressure_overwhelm"
    HARMFUL_CONTENT = "harmful_content"


# ── Custom exception ──────────────────────────────────────────────────────── #

class ContentSafetyFlagged(Exception):
    """
    Raised when content fails safety or cognitive-pressure screening.
    Carries both a calm user-facing message and a machine-readable category
    so the frontend can show context-appropriate UI (icon, color, guidance).
    """

    def __init__(
        self,
        message: str = "We weren't able to process that — could you try rephrasing?",
        category: str = FlagCategory.HARMFUL_CONTENT,
    ):
        self.message = message
        self.category = category
        super().__init__(message)


# ── Service ───────────────────────────────────────────────────────────────── #

class ContentSafetyService:
    """
    Context-aware, two-layer content screening service.

    Use screen_user_intent() for short user-authored text (goals, task names,
    context fields). This runs both the cognitive-pressure regex layer and the
    Azure Content Safety API.

    Use screen_document() for longer user-submitted documents (paste-to-
    simplify). This runs only the Azure Content Safety API — documents naturally
    contain imperative language and should not be flagged for "overwhelm".

    Use screen_output() for AI-generated text before it reaches the user.
    Runs Azure API with a relaxed threshold since the model is already
    prompt-engineered for calm, supportive tone.
    """

    def __init__(self, endpoint: str | None, key: str | None) -> None:
        self._client = None

        if endpoint and key:
            try:
                from azure.ai.contentsafety.aio import ContentSafetyClient
                from azure.core.credentials import AzureKeyCredential

                self._client = ContentSafetyClient(
                    endpoint, AzureKeyCredential(key)
                )
                logger.info(
                    "content_safety.init",
                    extra={"event": "client_ready", "status": "ok"},
                )
            except Exception as exc:
                logger.warning(
                    "content_safety.init",
                    extra={"event": "client_failed", "error": str(exc)},
                )
        else:
            logger.warning(
                "content_safety.init",
                extra={
                    "event": "client_disabled",
                    "reason": "CONTENT_SAFETY_ENDPOINT or CONTENT_SAFETY_KEY not set",
                },
            )

    # ── Public interface ──────────────────────────────────────────────────── #

    async def screen_user_intent(self, text: str) -> str:
        """
        Screen short, user-authored intent text (goals, task names, context).
        Runs cognitive-pressure regex first (no network), then Azure API.
        Returns text unchanged if safe. Raises ContentSafetyFlagged if not.
        """
        if not text or not text.strip():
            return text
        self._check_cognitive_pressure(text)
        await self._check_azure(text, threshold=_INPUT_SEVERITY_THRESHOLD)
        return text

    async def screen_document(self, text: str) -> str:
        """
        Screen document text submitted for simplification.
        Runs Azure API only — skips cognitive-pressure check because documents
        (contracts, articles, textbooks) naturally contain imperative language.
        Returns text unchanged if safe. Raises ContentSafetyFlagged if not.
        """
        if not text or not text.strip():
            return text
        await self._check_azure(text, threshold=_INPUT_SEVERITY_THRESHOLD)
        return text

    async def screen_output(self, text: str) -> str:
        """
        Screen AI-generated text before it reaches the user.
        Uses a relaxed threshold — model is prompt-engineered to be calm,
        but we verify harmful content categories are not present.
        Returns text unchanged if safe. Raises ContentSafetyFlagged if not.
        """
        if not text or not text.strip():
            return text
        await self._check_azure(text, threshold=_OUTPUT_SEVERITY_THRESHOLD)
        return text

    # ── Chat-specific methods (non-raising) ───────────────────────────────── #

    def detect_cognitive_pressure(self, text: str) -> str | None:
        """
        Returns the first cognitive pressure category detected in text, or None.
        Unlike _check_cognitive_pressure, this never raises — it returns the
        category name so the caller can decide what to do with it.
        Used by /api/chat to inform Block 6 emotional state without blocking.
        """
        if not text or not text.strip():
            return None
        if _URGENCY.search(text):
            return FlagCategory.URGENCY
        if _GUILT.search(text):
            return FlagCategory.GUILT
        if _CATASTROPHIZING.search(text):
            return FlagCategory.CATASTROPHIZING
        if _PERFECTIONISM.search(text):
            return FlagCategory.PERFECTIONISM
        if _SHAME.search(text):
            return FlagCategory.SHAME
        if _COMPARISON.search(text):
            return FlagCategory.COMPARISON
        if len(_DEMANDS.findall(text)) >= _OVERWHELM_THRESHOLD:
            return FlagCategory.OVERWHELM
        return None

    async def get_azure_severity(self, text: str) -> tuple[int, str | None]:
        """
        Returns (max_severity, category_name) across all Azure Content Safety
        categories. Returns (0, None) when the client is unavailable or the
        API call fails — we never block a user due to an infra error.
        Used by /api/chat to apply tiered safety handling (hard block vs soft
        flag vs clean) instead of the binary raise/pass pattern used elsewhere.
        """
        if self._client is None or not text or not text.strip():
            return 0, None

        try:
            from azure.ai.contentsafety.models import AnalyzeTextOptions

            result = await self._client.analyze_text(
                AnalyzeTextOptions(text=text[:_AZURE_MAX_CHARS])
            )

            max_severity = 0
            max_category: str | None = None
            for item in result.categories_analysis:
                if item.severity is not None and item.severity > max_severity:
                    max_severity = item.severity
                    max_category = str(item.category)

            return max_severity, max_category

        except Exception as exc:
            logger.error(
                "content_safety.get_azure_severity",
                extra={"event": "azure_api_error", "error": str(exc)},
            )
            return 0, None

    async def close(self) -> None:
        """Release the underlying HTTP connection pool."""
        if self._client is not None:
            await self._client.close()

    # ── Internal helpers ──────────────────────────────────────────────────── #

    def _check_cognitive_pressure(self, text: str) -> None:
        """
        Local pattern matching — no network call.
        Checks six cognitive-pressure categories in order of specificity.
        Raises ContentSafetyFlagged with a category-specific calm message.
        """
        if _URGENCY.search(text):
            raise ContentSafetyFlagged(
                message=(
                    "We noticed some time-pressure language in there. "
                    "We work best with calm descriptions — could you rephrase "
                    "without the urgency?"
                ),
                category=FlagCategory.URGENCY,
            )

        if _GUILT.search(text):
            raise ContentSafetyFlagged(
                message=(
                    "We want this to be a supportive space. "
                    "Could you describe the situation without self-blame? "
                    "We're here to help, not to judge."
                ),
                category=FlagCategory.GUILT,
            )

        if _CATASTROPHIZING.search(text):
            raise ContentSafetyFlagged(
                message=(
                    "It sounds like things feel really overwhelming right now — "
                    "that's okay. Try describing one specific thing you'd like help with."
                ),
                category=FlagCategory.CATASTROPHIZING,
            )

        if _PERFECTIONISM.search(text):
            raise ContentSafetyFlagged(
                message=(
                    "There's no perfect here — just progress. "
                    "Could you describe what you're working on in simple terms?"
                ),
                category=FlagCategory.PERFECTIONISM,
            )

        if _SHAME.search(text):
            raise ContentSafetyFlagged(
                message=(
                    "You deserve a kind, judgement-free space. "
                    "Could you describe what you need help with today?"
                ),
                category=FlagCategory.SHAME,
            )

        if _COMPARISON.search(text):
            raise ContentSafetyFlagged(
                message=(
                    "Everyone moves at their own pace — including you. "
                    "Tell us what you're working on and we'll help you with that."
                ),
                category=FlagCategory.COMPARISON,
            )

        demand_count = len(_DEMANDS.findall(text))
        if demand_count >= _OVERWHELM_THRESHOLD:
            raise ContentSafetyFlagged(
                message=(
                    "That sounds like a lot at once — and that's completely okay. "
                    "Try sharing one goal at a time so we can help you "
                    "break it into manageable steps."
                ),
                category=FlagCategory.OVERWHELM,
            )

    async def _check_azure(self, text: str, threshold: int) -> None:
        """
        Call the Azure Content Safety API with the given severity threshold.
        Truncates text to Azure's 10k char limit before sending.
        No-ops gracefully if the client is not configured or the API is
        temporarily unavailable — we never block a user due to an infra error.
        """
        if self._client is None:
            return

        try:
            from azure.ai.contentsafety.models import AnalyzeTextOptions

            result = await self._client.analyze_text(
                AnalyzeTextOptions(text=text[:_AZURE_MAX_CHARS])
            )

            for item in result.categories_analysis:
                if item.severity is not None and item.severity >= threshold:
                    logger.warning(
                        "content_safety.flagged",
                        extra={
                            "event": "azure_flag",
                            "category": str(item.category),
                            "severity": item.severity,
                            "threshold": threshold,
                        },
                    )
                    raise ContentSafetyFlagged(category=FlagCategory.HARMFUL_CONTENT)

        except ContentSafetyFlagged:
            raise

        except Exception as exc:
            # Transient API failure — log but never block the user
            logger.error(
                "content_safety.error",
                extra={"event": "azure_api_error", "error": str(exc)},
            )
