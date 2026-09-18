"""The library's entire public surface.

``EMLError(code)`` resolves ``code`` against the Error Management UI's public lookup API —
configured via the ``APPNAME``, ``EML_API``, and ``ENVIRONMENT`` environment variables — and
always produces a usable exception. If EML itself can't be reached, or returns something this
library can't use, a local fallback message is used instead; nothing but a
successfully-constructed ``EMLError`` ever escapes ``__init__``. That resilience is the entire
point of this library: its own error handling must never itself crash the calling application.

Unlike the JavaScript library (which needed a private constructor plus a static async factory
because Node's ``fetch`` always returns a ``Promise``), Python has no such restriction:
``urllib.request.urlopen`` is a normal, synchronous, blocking call, exactly like Java's
``HttpClient.send()``. ``EMLError.__init__`` therefore performs the lookup synchronously
itself, matching Java's design exactly — ``raise EMLError("FIL1010")`` is a genuine one-line
call site, no factory or ``await`` required. Of the three libraries built so far, Python is the
closest to the project's original literal usage convention (``raise EMLError(code)``) because
the language places no restriction on blocking I/O inside a constructor.
"""

from __future__ import annotations

import logging

from .config import api_base_url, app_name, default_language, environment
from .lookup_client import lookup
from .lookup_result import LookupResult

_LOGGER = logging.getLogger(__name__)


class EMLError(Exception):
    """Raising ``EMLError(code)`` is the entire call site — nothing else is required.

    Every field from the lookup response is exposed as a plain public instance attribute
    (Python-idiomatic ``snake_case``, per PEP 8 — not the JSON response's ``camelCase``, and
    not getter methods the way the Java library exposes them). ``resolved`` distinguishes a
    real, authored EML response (``True``) from a local fallback (``False``) — the one signal
    the server JSON can never carry itself.
    """

    def __init__(self, code: str, language: str | None = None):
        resolved_language = language if language is not None else default_language()
        result = _resolve(code, resolved_language)

        super().__init__(f"{result.code}: {result.friendly_message}")

        self.code = result.code
        self.appname = result.appname
        self.environment = result.environment
        self.language = result.language
        self.header = result.header
        self.description = result.description
        self.friendly_message = result.friendly_message
        self.category = result.category
        self.error_category = result.error_category
        self.http_code = result.http_code
        self.alert_string = result.alert_string
        self.redirect_url = result.redirect_url
        self.event_id = result.event_id
        self.event_category = result.event_category
        self.trans_id_display = result.trans_id_display
        self.retry_enabled = result.retry_enabled
        self.error_code_display = result.error_code_display
        self.needs_authoring = result.needs_authoring
        self.resolved = result.resolved


def _resolve(code: str, language: str) -> LookupResult:
    try:
        return lookup(app_name(), api_base_url(), environment(), code, language)
    except Exception as e:  # noqa: BLE001 — deliberately broad, see below.
        # Java only catches RuntimeException | EMLLookupFailedException, deliberately leaving
        # real JVM Errors (e.g. OutOfMemoryError) to propagate uncaught. JavaScript makes the
        # equivalent narrow choice. Python's exception hierarchy doesn't offer as clean a
        # "definitely fatal, let it propagate" tier directly below Exception for this purpose —
        # there's no Python analogue to a JVM Error that sits alongside "normal" exceptions.
        # Catching `Exception` (rather than `BaseException`) is the correct Python-idiomatic
        # equivalent of Java's intent: `KeyboardInterrupt`, `SystemExit`, and `GeneratorExit`
        # all inherit directly from `BaseException`, NOT `Exception`, so they are deliberately
        # NOT caught here and still propagate normally, exactly as a JVM Error would in Java.
        # Every other failure mode this library can encounter (LookupFailedError, and any
        # stdlib exception bubbling out of urllib/json in a way not already wrapped) is an
        # expected, recoverable failure and is replaced with a local fallback below.
        _LOGGER.warning("EML lookup failed for code '%s': %s", code, e)
        return LookupResult.local_fallback(code)
