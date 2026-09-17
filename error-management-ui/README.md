# Error Management UI

The full-stack admin application that owns the error catalog: app owners register their apps and manage their error codes here, and its backend serves the public API that [libraries](../libraries/README.md) and [Error UI](../error-ui/README.md) call.

See [Error Code Schema](../docs/error-code-schema.md) for the field contract this app manages and the JSON shape its API returns.

## Responsibilities

### Admin frontend
- Register a new app (`APPNAME`).
- Per-app manager view: every error code registered for that app, split into codes still on auto-generated placeholder text (**needs authoring**) and codes already authored.
- Edit form for every field on a code (see schema doc).
- Preview: raw JSON, plus a rendered sample of both the full-page and inline/toast presentation for that code.

### Backend API (Postgres-backed)
- Public lookup endpoint: given `APPNAME + CODE + LANGUAGE`, returns the error JSON. Unknown `(APPNAME, CODE)` pairs are auto-registered with placeholder text and flagged for authoring — the lookup still succeeds.
- CRUD for error code definitions, per app and per locale.
- App registration and owner auth for the admin side.

## Planned Structure

```
error-management-ui/
├── frontend/       # Admin web app (framework TBD)
├── backend/        # API service: app registration, error CRUD, public lookup endpoint (Postgres)
├── Dockerfile      # Container image for this service
└── tests/
```

Runs as one of the services in the root [docker-compose.yml](../docker-compose.yml), backed by the `postgres` service defined there.

## Status

Structure only — no implementation yet. Frontend framework and backend stack are still open.
