"""
Azure Key Vault integration for NeuroFocus.

Fetches secrets at app startup and patches the Settings object so the rest
of the codebase never needs to know where secrets came from.

Secret name convention: Key Vault names use hyphens, Settings fields use
underscores. The mapping below is the single source of truth.

Credential chain (DefaultAzureCredential):
  - Local dev:    az login session, or AZURE_CLIENT_ID/TENANT_ID/CLIENT_SECRET env vars
  - App Service:  Managed Identity (no credentials in code or env required)
  - CI/CD:        AZURE_CLIENT_ID/TENANT_ID/CLIENT_SECRET or federated identity

Graceful degradation: if KEYVAULT_URL is not set, this module is a no-op.
Individual missing secrets are warned about but never crash the app — the
value from .env (or Settings default) is kept instead.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from config import Settings

logger = logging.getLogger(__name__)

# Map: Key Vault secret name → Settings field name.
# Only secrets that should be stored in Key Vault are listed here.
# Non-sensitive settings (database name, container name, allowed origins)
# stay in environment variables / App Service configuration.
_SECRET_MAP: dict[str, str] = {
    "azure-openai-api-key":            "azure_openai_api_key",
    "azure-openai-endpoint":           "azure_openai_endpoint",
    "cosmos-key":                      "cosmos_key",
    "cosmos-endpoint":                 "cosmos_endpoint",
    "content-safety-key":              "content_safety_key",
    "content-safety-endpoint":         "content_safety_endpoint",
    "blob-connection-string":          "blob_connection_string",
    "doc-intelligence-key":            "doc_intelligence_key",
    "doc-intelligence-endpoint":       "doc_intelligence_endpoint",
    "app-insights-connection-string":  "app_insights_connection_string",
}


def patch_settings_from_keyvault(settings: "Settings") -> "Settings":
    """
    Fetch secrets from Azure Key Vault and return a new Settings instance
    with Key Vault values merged in (Key Vault wins over env vars).

    Returns the original settings unchanged if:
    - KEYVAULT_URL is not configured
    - The Key Vault client cannot be initialised (auth failure, network, etc.)

    Individual missing secrets (KeyVaultError on a single fetch) are skipped
    with a warning — the env var value is kept for that field.
    """
    if not settings.keyvault_url:
        logger.info(
            "keyvault.patch",
            extra={"event": "keyvault_skipped", "reason": "KEYVAULT_URL not set"},
        )
        return settings

    try:
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.secrets import SecretClient

        credential = DefaultAzureCredential()
        client = SecretClient(vault_url=settings.keyvault_url, credential=credential)
    except Exception as exc:
        logger.warning(
            "keyvault.patch",
            extra={"event": "keyvault_client_failed", "error": str(exc)},
        )
        return settings

    # Start with the current settings values as a base
    overrides: dict[str, str] = {}

    for secret_name, field_name in _SECRET_MAP.items():
        try:
            secret = client.get_secret(secret_name)
            if secret.value:
                overrides[field_name] = secret.value
                logger.info(
                    "keyvault.patch",
                    extra={"event": "secret_loaded", "secret": secret_name},
                )
        except Exception as exc:
            # Secret not found or permission denied — keep the env var value
            logger.warning(
                "keyvault.patch",
                extra={
                    "event": "secret_skipped",
                    "secret": secret_name,
                    "error": str(exc),
                },
            )

    if not overrides:
        logger.info(
            "keyvault.patch",
            extra={"event": "keyvault_no_overrides", "reason": "no secrets fetched"},
        )
        return settings

    # Use model_copy to apply overrides directly on the existing instance.
    # Constructing a new Settings(**merged) would re-trigger pydantic-settings
    # env var resolution, where env vars outrank constructor kwargs — meaning
    # Key Vault values would be silently ignored. model_copy bypasses that.
    patched = settings.model_copy(update=overrides)

    logger.info(
        "keyvault.patch",
        extra={"event": "keyvault_applied", "secret_count": len(overrides)},
    )
    return patched
