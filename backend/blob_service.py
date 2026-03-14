"""
Azure Blob Storage service for NeuroFocus.

Stores uploaded documents for archival. Each file is stored under a
user-scoped, UUID-prefixed path so documents are organised by user and
filenames never collide or expose other users' data.

Blob path format: {user_id}/{uuid}/{sanitized_filename}

Graceful degradation: if BLOB_CONNECTION_STRING is not configured, uploads
are skipped with a warning. Document extraction still works — blob storage
is for archival, not for the extraction pipeline.
"""
from __future__ import annotations

import logging
import re
import uuid

logger = logging.getLogger(__name__)

_CONTAINER_DEFAULT = "documents"

# Characters allowed in blob filenames. Everything else is replaced with _.
_SAFE_FILENAME = re.compile(r"[^\w\-.]")


def _sanitize_filename(filename: str) -> str:
    """
    Strip path traversal characters and anything that isn't alphanumeric,
    a hyphen, underscore, or dot. Prevents blob name injection.
    """
    # Remove directory separators first
    base = filename.replace("\\", "/").split("/")[-1]
    safe = _SAFE_FILENAME.sub("_", base)
    # Prevent leading dots (hidden files on some systems)
    return safe.lstrip(".") or "document"


class BlobService:
    """
    Async wrapper around Azure Blob Storage.
    Uploads raw file bytes under a user-scoped, UUID-prefixed path.
    """

    def __init__(self, connection_string: str | None, container: str | None) -> None:
        self._client = None
        self._container = container or _CONTAINER_DEFAULT

        if connection_string:
            try:
                from azure.storage.blob.aio import BlobServiceClient

                self._client = BlobServiceClient.from_connection_string(
                    connection_string
                )
                logger.info(
                    "blob_service.init",
                    extra={"event": "client_ready", "container": self._container},
                )
            except Exception as exc:
                logger.warning(
                    "blob_service.init",
                    extra={"event": "client_failed", "error": str(exc)},
                )
        else:
            logger.warning(
                "blob_service.init",
                extra={
                    "event": "client_disabled",
                    "reason": "BLOB_CONNECTION_STRING not set — uploads will be skipped",
                },
            )

    # ── Public interface ──────────────────────────────────────────────────── #

    @property
    def available(self) -> bool:
        return self._client is not None

    async def ensure_container(self) -> None:
        """
        Create the blob container if it doesn't exist.
        Called once at app startup, not on every upload.
        """
        if self._client is None:
            return
        try:
            container_client = self._client.get_container_client(self._container)
            await container_client.create_container()
            logger.info(
                "blob_service.ensure_container",
                extra={"event": "container_created", "container": self._container},
            )
        except Exception as exc:
            err = str(exc)
            if "ContainerAlreadyExists" in err or "already exists" in err.lower():
                # Expected on every run after the first — not an error
                logger.info(
                    "blob_service.ensure_container",
                    extra={"event": "container_exists", "container": self._container},
                )
            else:
                # Genuine failure — auth error, wrong connection string, network issue
                logger.error(
                    "blob_service.ensure_container",
                    extra={
                        "event": "container_error",
                        "container": self._container,
                        "error": err,
                    },
                )

    async def upload(
        self,
        file_bytes: bytes,
        original_filename: str,
        content_type: str,
        user_id: str = "default-user",
    ) -> str:
        """
        Upload file bytes to Blob Storage.
        Returns the blob name: {user_id}/{uuid}/{sanitized_filename}.
        Raises RuntimeError if client is not configured.
        """
        if self._client is None:
            raise RuntimeError("Blob Storage is not configured.")

        safe_name = _sanitize_filename(original_filename)
        blob_name = f"{user_id}/{uuid.uuid4().hex}/{safe_name}"

        container_client = self._client.get_container_client(self._container)
        await container_client.upload_blob(
            name=blob_name,
            data=file_bytes,
            content_settings=_content_settings(content_type),
            overwrite=True,
        )

        logger.info(
            "blob_service.upload",
            extra={
                "event": "upload_ok",
                "blob_name": blob_name,
                "size_bytes": len(file_bytes),
                "user_id": user_id,
            },
        )
        return blob_name

    async def delete(self, blob_name: str) -> None:
        """Delete a blob — used to clean up if downstream processing fails."""
        if self._client is None:
            return
        try:
            container_client = self._client.get_container_client(self._container)
            await container_client.delete_blob(blob_name)
        except Exception as exc:
            logger.warning(
                "blob_service.delete",
                extra={"event": "delete_failed", "blob_name": blob_name, "error": str(exc)},
            )

    async def close(self) -> None:
        """Release the underlying HTTP connection pool."""
        if self._client is not None:
            await self._client.close()


# ── Helpers ───────────────────────────────────────────────────────────────── #

def _content_settings(content_type: str):
    try:
        from azure.storage.blob import ContentSettings
        return ContentSettings(content_type=content_type)
    except Exception:
        return None
