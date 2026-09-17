# Error UI

An embeddable UI layer that renders a managed error message to the end user, consistently across every app that adopts it.

See [Error Code Schema](../docs/error-code-schema.md) for the JSON shape this renders.

## Integration modes

- **Direct lookup**: given `APPNAME + CODE + LANGUAGE`, calls the [Error Management UI](../error-management-ui/README.md) backend's public API itself and renders the result.
- **Pre-resolved payload**: the host app already resolved the error via its [library](../libraries/README.md) and hands Error UI the resulting JSON directly — no second API call.

## Display modes

Selected by the error's `ALERT_STRING`/display-mode field:
- **Full error page** — for hard failures / navigation-blocking errors.
- **Inline / toast** — for non-blocking errors surfaced in place.

When `REDIRECT_URL` is set on the error, Error UI honors it (e.g. offering or performing a redirect) regardless of display mode.

## Planned Structure

```
error-ui/
├── src/         # Component source (framework TBD)
├── Dockerfile   # Container image for this service
└── tests/
```

Runs as one of the services in the root [docker-compose.yml](../docker-compose.yml).

## Status

Structure only — no implementation yet. Framework choice is still open.
