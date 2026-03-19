"""
Azure AI Document Intelligence service for NeuroFocus.

Extracts clean, structured text from uploaded PDF and Word documents using
the prebuilt-read model. Supports PDF, DOCX, DOC, and common image formats
(PNG, JPG, TIFF) including OCR for scanned documents.

Two-stage file validation:
  1. Content-Type header check (fast, first gate)
  2. Magic byte check (verifies actual file bytes match claimed type)

Text is returned as a single string ready to pass into /api/summarise.
Page count is returned so the frontend can show a preview hint.

Graceful degradation: if DOC_INTELLIGENCE_ENDPOINT / DOC_INTELLIGENCE_KEY
are not configured, the service raises a clear error with a calm message.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Supported MIME types and their friendly names for error messages
SUPPORTED_TYPES: dict[str, str] = {
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word (.docx)",
    "application/msword": "Word (.doc)",
    "image/jpeg": "JPEG image",
    "image/png": "PNG image",
    "image/tiff": "TIFF image",
    "image/bmp": "BMP image",
}

# Magic byte signatures per MIME type.
# These are the actual first bytes of valid files — used to detect spoofed
# content types (e.g. an .exe uploaded with content_type: application/pdf).
_SIGNATURES: dict[str, list[bytes]] = {
    "application/pdf": [b"%PDF"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
        b"PK\x03\x04"  # DOCX is a ZIP-based format
    ],
    "application/msword": [
        b"\xd0\xcf\x11\xe0"  # OLE2 compound document (legacy .doc)
    ],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/tiff": [b"II*\x00", b"MM\x00*"],  # little-endian and big-endian TIFF
    "image/bmp": [b"BM"],
}

# Azure Document Intelligence prebuilt model — extracts text and layout
_MODEL = "prebuilt-read"

# Max file size: 20 MB (Azure hard limit is 500 MB, but we keep it reasonable)
MAX_FILE_BYTES = 20 * 1024 * 1024


def _matches_magic(file_bytes: bytes, content_type: str) -> bool:
    """
    Verify that the first bytes of the file match the claimed content type.
    Returns False if the content type is unknown or bytes don't match any
    known signature — fail safe.
    """
    signatures = _SIGNATURES.get(content_type, [])
    if not signatures:
        return False
    return any(file_bytes[: len(sig)] == sig for sig in signatures)


class DocIntelligenceService:
    """
    Async wrapper around Azure AI Document Intelligence.
    Uses the prebuilt-read model to extract text from documents and images.
    """

    def __init__(self, endpoint: str | None, key: str | None) -> None:
        self._client = None

        if endpoint and key:
            try:
                from azure.ai.formrecognizer.aio import DocumentAnalysisClient
                from azure.core.credentials import AzureKeyCredential

                self._client = DocumentAnalysisClient(
                    endpoint, AzureKeyCredential(key)
                )
                logger.info(
                    "doc_intelligence.init",
                    extra={"event": "client_ready", "model": _MODEL},
                )
            except Exception as exc:
                logger.warning(
                    "doc_intelligence.init",
                    extra={"event": "client_failed", "error": str(exc)},
                )
        else:
            logger.warning(
                "doc_intelligence.init",
                extra={
                    "event": "client_disabled",
                    "reason": "DOC_INTELLIGENCE_ENDPOINT or DOC_INTELLIGENCE_KEY not set",
                },
            )

    # ── Public interface ──────────────────────────────────────────────────── #

    @property
    def available(self) -> bool:
        return self._client is not None

    async def extract_text(
        self,
        file_bytes: bytes,
        content_type: str,
    ) -> tuple[str, int]:
        """
        Extract text from document bytes.

        Returns (extracted_text, page_count).
        Raises ValueError for unsupported types, oversized files, spoofed
        content types, or documents with no extractable text.
        Raises RuntimeError if the service is not configured.
        """
        if self._client is None:
            raise RuntimeError(
                "Document Intelligence is not configured. "
                "Set DOC_INTELLIGENCE_ENDPOINT and DOC_INTELLIGENCE_KEY."
            )

        # Gate 1: content type header
        if content_type not in SUPPORTED_TYPES:
            raise ValueError(
                "File type not supported. Please upload a "
                f"{', '.join(SUPPORTED_TYPES.values())} file."
            )

        # Gate 2: file size
        if len(file_bytes) > MAX_FILE_BYTES:
            raise ValueError(
                "File is too large (max 20 MB). "
                "Try splitting the document into smaller sections."
            )

        # Gate 3: magic byte verification — catches spoofed content types
        if not _matches_magic(file_bytes, content_type):
            logger.warning(
                "doc_intelligence.extract",
                extra={
                    "event": "magic_mismatch",
                    "claimed_type": content_type,
                },
            )
            raise ValueError(
                "The file doesn't match its reported type. "
                "Please make sure you're uploading an unmodified file."
            )

        try:
            poller = await self._client.begin_analyze_document(
                _MODEL,
                document=file_bytes,
            )
            result = await poller.result()
        except Exception as exc:
            logger.error(
                "doc_intelligence.extract",
                extra={"event": "extraction_failed", "error": str(exc)},
            )
            raise RuntimeError(
                "We had trouble reading that document. "
                "Please check the file isn't corrupted and try again."
            ) from exc

        text = _build_text(result)
        page_count = len(result.pages) if result.pages else 1

        # Gate 4: empty result — encrypted, blank, or image-only document
        if not text.strip():
            raise ValueError(
                "We couldn't find any readable text in that document. "
                "If it's a scanned image, make sure the scan quality is clear. "
                "If it's password-protected, please remove the password first."
            )

        logger.info(
            "doc_intelligence.extract",
            extra={
                "event": "extraction_ok",
                "page_count": page_count,
                "char_count": len(text),
            },
        )

        return text, page_count

    async def close(self) -> None:
        """Release the underlying HTTP connection pool."""
        if self._client is not None:
            await self._client.close()


# ── Helpers ───────────────────────────────────────────────────────────────── #

def _build_text(result) -> str:
    """
    Concatenate extracted text from all pages into a single clean string.
    Preserves paragraph breaks between pages. Strips excessive whitespace.
    """
    if not result.pages:
        return ""

    lines: list[str] = []
    for page in result.pages:
        if not page.lines:
            continue
        for line in page.lines:
            content = line.content.strip()
            if content:
                lines.append(content)
        lines.append("")  # blank line between pages

    return "\n".join(lines).strip()
