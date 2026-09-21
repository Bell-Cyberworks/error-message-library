"""Calls the Error Management UI's public lookup endpoint —
``GET /api/v1/lookup?application=&code=&environment=`` with an ``Accept-Language`` header for
language and an ``Authorization: Bearer <key>`` header for the required API key (see
``error-management-ui/src/app/api/v1/lookup/route.ts``) — and translates a successful response
into a :class:`LookupResult`.

Every failure mode (bad configuration, network failure, non-2xx HTTP status, unparseable or
unusable response body) is signaled by raising :class:`LookupFailedError`; this module never
itself decides to fall back — that's ``EMLError``'s job (see ``error.py``).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

from .lookup_result import LookupResult

REQUEST_TIMEOUT_SECONDS = 3


class LookupFailedError(Exception):
    """Signals that an EML lookup did not succeed, for any reason: invalid/missing
    configuration, a network failure, a non-2xx HTTP status, or a response body that could not
    be parsed/used. Never seen outside this module — ``EMLError`` always catches it and falls
    back to ``LookupResult.local_fallback()``.
    """


def lookup(
    appname: str | None,
    api_base_url: str | None,
    environment: str | None,
    code: str,
    language: str,
    api_key: str | None,
) -> LookupResult:
    if (
        _is_blank(appname)
        or _is_blank(api_base_url)
        or _is_blank(environment)
        or _is_blank(api_key)
    ):
        raise LookupFailedError(
            "Missing required configuration: APPNAME, EML_API, ENVIRONMENT, and EML_API_KEY "
            "must all be set"
        )

    # _is_blank already confirmed these are non-None, non-blank strings.
    assert appname is not None
    assert api_base_url is not None
    assert environment is not None
    assert api_key is not None

    base_url = api_base_url[:-1] if api_base_url.endswith("/") else api_base_url
    query = urllib.parse.urlencode(
        {"application": appname, "code": code, "environment": environment}
    )
    url = f"{base_url}/api/v1/lookup?{query}"

    request = urllib.request.Request(
        url, headers={"Accept-Language": language, "Authorization": f"Bearer {api_key}"}
    )

    # urlopen's `timeout` covers the whole connect+read cycle in one value — Python has no
    # separate connect-timeout/request-timeout pair the way Java's HttpClient does. This is the
    # same idiomatic single-combined-timeout adaptation the JavaScript library already made
    # (there, via `AbortSignal.timeout`) for the same reason: `fetch`/`urlopen` don't expose
    # connect and read phases as separately configurable timeouts the way `HttpClient` does.
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            raw_body = response.read()
    except urllib.error.HTTPError as e:
        # urlopen raises HTTPError itself for any non-2xx status — unlike Java/JS, where the
        # request completes normally and the status code is checked afterward.
        raise LookupFailedError(
            f"EML lookup for code '{code}' returned HTTP {e.code}"
        ) from e
    except urllib.error.URLError as e:
        # Covers network failures, DNS failures, and timeouts. socket.timeout/TimeoutError
        # surface here as (or wrapped by) URLError, so a single except clause covers all of
        # them.
        raise LookupFailedError(
            f"EML lookup request failed for code '{code}'"
        ) from e

    try:
        body = raw_body.decode("utf-8")
    except UnicodeDecodeError as e:
        raise LookupFailedError(
            f"EML lookup response body for code '{code}' could not be decoded as UTF-8"
        ) from e

    return _parse_response(body, code, appname, environment, language)


def _parse_response(
    body: str, code: str, appname: str, environment: str, language: str
) -> LookupResult:
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as e:
        raise LookupFailedError(
            f"EML lookup response for code '{code}' was not valid JSON"
        ) from e

    if not isinstance(parsed, dict):
        raise LookupFailedError(
            f"EML lookup response for code '{code}' was not a JSON object"
        )

    # header and friendlyMessage are the two fields the rest of this library can't function
    # without; every other field is deliberately lenient (safe per-field default) so a future
    # server-side change doesn't break older client versions. Note the camelCase (JSON) ->
    # snake_case (Python attribute) mapping performed here field-by-field.
    header_value = parsed.get("header")
    friendly_message_value = parsed.get("friendlyMessage")
    if not isinstance(header_value, str) or not isinstance(friendly_message_value, str):
        raise LookupFailedError(
            f"EML lookup response for code '{code}' is missing required string "
            "field(s) 'header'/'friendlyMessage'"
        )

    return LookupResult(
        code=_string_or_default(parsed, "code", code),
        appname=_string_or_default(parsed, "appname", appname),
        environment=_string_or_default(parsed, "environment", environment),
        language=_string_or_default(parsed, "language", language),
        header=header_value,
        description=_string_or_default(parsed, "description", ""),
        friendly_message=friendly_message_value,
        category=_string_or_default(parsed, "category", ""),
        error_category=_string_or_default(parsed, "errorCategory", ""),
        http_code=_int_or_default(parsed, "httpCode", 0),
        alert_string=_string_or_default(parsed, "alertString", ""),
        redirect_url=_nullable_string(parsed, "redirectUrl"),
        event_id=_nullable_string(parsed, "eventId"),
        event_category=_nullable_string(parsed, "eventCategory"),
        trans_id_display=_bool_or_default(parsed, "transIdDisplay", False),
        retry_enabled=_bool_or_default(parsed, "retryEnabled", False),
        error_code_display=_bool_or_default(parsed, "errorCodeDisplay", False),
        needs_authoring=_bool_or_default(parsed, "needsAuthoring", False),
        resolved=True,
    )


def _is_blank(value: str | None) -> bool:
    return value is None or value.strip() == ""


def _string_or_default(json_obj: dict, key: str, default: str) -> str:
    value = json_obj.get(key)
    return value if isinstance(value, str) else default


def _nullable_string(json_obj: dict, key: str) -> str | None:
    value = json_obj.get(key)
    return value if isinstance(value, str) else None


def _int_or_default(json_obj: dict, key: str, default: int) -> int:
    value = json_obj.get(key)
    # bool is a subclass of int in Python — explicitly exclude it so a stray JSON boolean
    # under an int-typed key doesn't silently coerce to 0/1.
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, float):
        return int(value)
    return default


def _bool_or_default(json_obj: dict, key: str, default: bool) -> bool:
    value = json_obj.get(key)
    return value if isinstance(value, bool) else default
