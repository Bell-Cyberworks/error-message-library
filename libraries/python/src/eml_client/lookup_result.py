"""Internal representation of the EML lookup API's JSON response.

Holds every field of the response documented in
``error-management-ui/src/app/api/v1/lookup/route.ts`` and
``docs/error-code-schema.md`` ("Response shape (sketch)"), plus one
library-only field: ``resolved``. ``resolved`` is ``True`` for a real server
response and ``False`` for a :func:`local_fallback` result — the one signal
the server JSON can never itself carry, since a fallback is built entirely on
the client with no server involved.

Attribute names are deliberately Python-idiomatic ``snake_case`` (``PEP 8``)
rather than mirroring the JSON's ``camelCase`` keys verbatim — e.g. the JSON
key ``friendlyMessage`` becomes the attribute ``friendly_message``. See
``lookup_client.py`` for the explicit camelCase-JSON-key ->
snake_case-Python-attribute mapping performed while parsing a response.

Not exported from ``__init__.py`` — this is an internal shape; ``EMLError``
(in ``error.py``) is the public surface consumers interact with.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LookupResult:
    code: str
    appname: str
    environment: str
    language: str
    header: str
    description: str
    friendly_message: str
    category: str
    error_category: str
    http_code: int
    alert_string: str
    redirect_url: str | None
    event_id: str | None
    event_category: str | None
    trans_id_display: bool
    retry_enabled: bool
    error_code_display: bool
    needs_authoring: bool
    resolved: bool

    @staticmethod
    def local_fallback(code: str) -> "LookupResult":
        """Builds a local, client-only result used when EML could not be reached or its
        response could not be used (bad config, network failure, non-2xx status,
        unparseable/incomplete body).

        ``needs_authoring`` is ``False`` here — not ``True`` — because that flag describes a
        real server-side "no owner has authored this code yet" state, and no database row was
        ever touched to make that determination; it simply doesn't apply.

        Kept in sync with the Java library's ``LookupResult.localFallback(String)`` and the
        JavaScript library's ``localFallback(code)`` for consistency across client libraries.
        """
        safe_code = code if code else ""
        return LookupResult(
            code=safe_code,
            appname="",
            environment="",
            language="",
            header="Error Handling Unavailable",
            description="",
            friendly_message=(
                f"An error occurred (code: {safe_code}), but the Error Message Library "
                "could not be reached. Please try again later or contact support."
            ),
            category="",
            error_category="",
            http_code=500,
            alert_string="",
            redirect_url=None,
            event_id=None,
            event_category=None,
            trans_id_display=False,
            retry_enabled=False,
            error_code_display=False,
            needs_authoring=False,
            resolved=False,
        )
