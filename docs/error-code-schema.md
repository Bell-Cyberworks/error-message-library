# Error Code Schema

This is the canonical contract shared by [Error Management UI](../error-management-ui/README.md), [Error UI](../error-ui/README.md), and every [library](../libraries/README.md). It defines what an Error Code is, how it's looked up, and the shape of the JSON everything else in the system consumes.

## Lookup key: `APPNAME + CODE`

An Error Code is only unique **per app**. The same `CODE` (e.g. `AUTH_001`) can mean something different for `app-a` than for `app-b`. Every lookup and registration is keyed on the pair `(APPNAME, CODE)`, never `CODE` alone.

`LANGUAGE` selects which locale's text comes back, without changing the code's identity.

## Auto-registration

If `(APPNAME, CODE)` doesn't exist yet when the API is queried:

1. It is created automatically with placeholder default text.
2. It's flagged in the Error Management UI as **needs authoring** for that app's owner.
3. The default placeholder response is returned immediately — the caller never gets a hard failure just because a code is new.

Once an owner edits the code in the Management UI, subsequent lookups return the authored text instead of the placeholder.

## Fields

> This list is provisional — it reflects what's known today and is expected to grow as the system is rebuilt.

| Field | Meaning |
|---|---|
| `HEADER` | Short title/headline for the error. |
| `DESCRIPTION` | Full explanatory text for the error. |
| `CATEGORY` | General grouping/classification for the error. |
| `ERROR_CATEGORY` | More specific error classification (distinct from `CATEGORY`; exact relationship TBD). |
| `HTTP_CODE` | HTTP status code associated with this error, for API responses. |
| `ALERT_STRING` | Drives how the error should be displayed — e.g. full error page vs. an inline banner/toast. |
| `REDIRECT_URL` | Optional URL to send the user to in response to this error. |

## Response shape (sketch)

Field names only — no transport/endpoint decisions have been made yet.

```json
{
  "appname": "string",
  "code": "string",
  "language": "string",
  "header": "string",
  "description": "string",
  "category": "string",
  "errorCategory": "string",
  "httpCode": 0,
  "alertString": "string",
  "redirectUrl": "string",
  "needsAuthoring": true
}
```

## Where this is used

- **Error Management UI** is the system of record: owners author/edit these fields per `(APPNAME, CODE)` and per locale, and its backend serves this JSON to everything else.
- **Libraries** resolve a thrown/raised `CODE` to this JSON by calling the Management UI's API with `APPNAME + CODE + LANGUAGE`. The same JSON is either handed to Error UI for rendering, or returned as-is as a service's own API error response body (no UI involved).
- **Error UI** renders this JSON as a full page or inline/toast based on `ALERT_STRING`, honoring `REDIRECT_URL` when set.
