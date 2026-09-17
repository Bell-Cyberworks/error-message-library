# Error Code Schema

This is the canonical contract shared by [Error Management UI](../error-management-ui/README.md), [Error UI](../error-ui/README.md), and every [library](../libraries/README.md). It defines what an Error Code is, how it's looked up, and the shape of the JSON everything else in the system consumes.

## Lookup key: `APPNAME + CODE`

An Error Code is only unique **per app**. The same `CODE` (e.g. `AUTH_001`) can mean something different for `app-a` than for `app-b`. Every lookup and registration is keyed on the pair `(APPNAME, CODE)`, never `CODE` alone.

`LANGUAGE` selects which locale's text comes back, without changing the code's identity.

> A prior Prisma-based implementation modeled this same idea as `Vertical` (→ `APPNAME`) owning many `ErrorMessage` rows unique per `(errorCode, verticalId)` (→ per-app `CODE` uniqueness), each with per-locale `ErrorDetails` unique per `(errorId, language)` (→ `(APPNAME, CODE, LANGUAGE)`). Kept here as a naming/structure reference, not a decision to reuse `Vertical` as a name.

## Auto-registration

If `(APPNAME, CODE)` doesn't exist yet when the API is queried:

1. It is created automatically with placeholder default text.
2. It's flagged in the Error Management UI as **needs authoring** for that app's owner.
3. The default placeholder response is returned immediately — the caller never gets a hard failure just because a code is new.

Once an owner edits the code in the Management UI, subsequent lookups return the authored text instead of the placeholder.

## Fields

> This list is provisional — it reflects what's known today and is expected to grow as the system is rebuilt. Fields marked *(prior schema)* come from an earlier Prisma-based implementation's `ErrorDetails` model, kept for reference — their exact meaning and whether they survive the rebuild is TBD.

| Field | Meaning |
|---|---|
| `HEADER` | Short title/headline for the error. (prior schema: `errorHeader`) |
| `DESCRIPTION` | Full explanatory text for the error. (prior schema: `errorDescription`) |
| `FRIENDLY_MESSAGE` | User-facing simplified message, distinct from `DESCRIPTION`. *(prior schema: `friendlyMessage`; whether this stays separate from `DESCRIPTION` is TBD)* |
| `CATEGORY` | General grouping/classification for the error. |
| `ERROR_CATEGORY` | More specific error classification (distinct from `CATEGORY`; exact relationship TBD). (prior schema: `errorCategory`) |
| `HTTP_CODE` | HTTP status code associated with this error, for API responses. (prior schema: `httpStatusCode`) |
| `ALERT_STRING` | Drives how the error should be displayed — e.g. full error page vs. an inline banner/toast. |
| `REDIRECT_URL` | Optional URL to send the user to in response to this error. |
| `EVENT_ID` | Identifier correlating this error occurrence to an underlying event/log entry. *(prior schema: `eventId`; exact use TBD)* |
| `EVENT_CATEGORY` | Categorization of that event, for logging/observability. *(prior schema: `eventCategory`; exact use TBD)* |
| `TRANS_ID_DISPLAY` | Controls whether/how a transaction ID is shown to the end user. *(prior schema: `transIdDisplay`)* |
| `RETRY_ENABLED` | Whether a retry action should be offered to the end user. *(prior schema: `retryEnabled`)* |
| `ERROR_CODE_DISPLAY` | Controls whether/how the raw error code itself is shown to the end user. *(prior schema: `errorCodeDisplay`)* |

## Response shape (sketch)

Field names only — no transport/endpoint decisions have been made yet.

```json
{
  "appname": "string",
  "code": "string",
  "language": "string",
  "header": "string",
  "description": "string",
  "friendlyMessage": "string",
  "category": "string",
  "errorCategory": "string",
  "httpCode": 0,
  "alertString": "string",
  "redirectUrl": "string",
  "eventId": "string",
  "eventCategory": "string",
  "transIdDisplay": "string",
  "retryEnabled": "string",
  "errorCodeDisplay": "string",
  "needsAuthoring": true
}
```

## Where this is used

- **Error Management UI** is the system of record: owners author/edit these fields per `(APPNAME, CODE)` and per locale, and its backend serves this JSON to everything else.
- **Libraries** resolve a thrown/raised `CODE` to this JSON by calling the Management UI's API with `APPNAME + CODE + LANGUAGE`. The same JSON is either handed to Error UI for rendering, or returned as-is as a service's own API error response body (no UI involved).
- **Error UI** renders this JSON as a full page or inline/toast based on `ALERT_STRING`, honoring `REDIRECT_URL` when set.
