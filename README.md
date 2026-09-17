# Error Message Library (EML)

Manage, change, and localize every error message in every app from one centralized system — self-hosted, so any company can download it and run it entirely inside their own environment.

Instead of hardcoding error strings inside individual applications, error messages (codes, default text, translations, HTTP status, display mode, etc.) are authored and managed centrally, and every app resolves them at runtime through a small per-language client library.

## Why self-hosted

Nothing here depends on an external hosted service. Every component ships as a container, and the whole stack — Error Management UI, Error UI, and its PostgreSQL datastore — comes up locally with a single `docker-compose up`. That's also how it's meant to be deployed: the same containers used for local build/test are what a company runs in production inside their own infrastructure.

## Project Structure

```
error-message-library/
├── docker-compose.yml       # local stack: Postgres + Error Management UI + Error UI
├── docs/
│   └── error-code-schema.md # canonical Error Code fields + API contract
├── error-management-ui/     # Admin app (frontend + backend API) for authoring & managing the error catalog
├── error-ui/                 # Embeddable UI that renders managed error messages to end users
└── libraries/                # Client SDKs for consuming EML, one per programming language
    ├── javascript/
    ├── python/
    ├── go/
    └── java/
```

## Components

### [Error Management UI](error-management-ui/README.md)
The full-stack admin app that app owners use to register their app and manage its error codes: which codes exist, which are still on auto-generated placeholder text and need authoring, and editing every field for any code. Its backend also serves the public API that libraries and Error UI call.

### [Error UI](error-ui/README.md)
A lightweight, embeddable UI layer that renders a resolved error message to the end user — as a full error page or an inline/toast, depending on the error's configured display mode.

### [Libraries](libraries/README.md)
Per-language client SDKs. Application code never writes error text — it just throws/raises an error code. The library intercepts that (as idiomatically as possible for its language), resolves it against the central catalog, logs it, and returns the result either for Error UI to render or as a raw API-to-API error response.

### [Error Code Schema](docs/error-code-schema.md)
The canonical contract — fields, lookup key, auto-registration behavior, and JSON shape — that all three components above agree on.

## How the pieces fit together

1. An app owner registers their app and authors its error codes in the **Error Management UI**.
2. Application code throws/raises an error **code** — nothing else. The **Library** for that language (configured with the app's name) intercepts the throw and calls the Management UI's API with `APPNAME + CODE + LANGUAGE`. If the code is new, it's auto-registered with placeholder text and flagged for the owner to author later — the call still succeeds.
3. The resulting JSON is either handed to **Error UI** to render (full page or inline/toast, based on the error's display mode) or returned directly as a service's own API error response when there's no UI involved at all.

## Local Development

```
docker-compose up
```

Brings up Postgres, Error Management UI, and Error UI locally for build and test. (Compose file is a placeholder until the underlying services exist.)

## Status

This repository currently contains the base project structure and documentation only. Implementation has not started — see each subdirectory's README for its planned scope.

## License

See [LICENSE](LICENSE).
