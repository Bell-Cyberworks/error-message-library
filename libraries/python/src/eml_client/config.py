"""Reads library configuration from environment variables, lazily — at lookup time, never
cached at import time. A missing or blank environment variable must never be able to break
anything at import time, since that would undermine the very error type (``EMLError``) whose
entire job is to report configuration and lookup failures gracefully instead of crashing the
calling application.
"""

from __future__ import annotations

import os


def app_name() -> str | None:
    return os.environ.get("APPNAME")


def api_base_url() -> str | None:
    return os.environ.get("EML_API")


def environment() -> str | None:
    return os.environ.get("ENVIRONMENT")


def api_key() -> str | None:
    return os.environ.get("EML_API_KEY")


def default_language() -> str:
    """No ``LANGUAGE`` environment variable exists. This mirrors the server's own default in
    ``resolveLanguage()`` (error-management-ui/src/app/api/v1/lookup/route.ts) for a
    missing/absent ``Accept-Language`` header, and matches the Java and JavaScript libraries'
    identical decision.
    """
    return "en"
