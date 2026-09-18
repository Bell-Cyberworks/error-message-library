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
├── src/
│   └── app/
│       ├── layout.tsx    # Root layout, page metadata
│       ├── globals.css   # Centered-card styling for the error display
│       └── page.tsx      # Server Component: reads query params, calls the lookup API, renders
├── public/
├── Dockerfile            # Multi-stage container image (Next.js standalone output)
├── next.config.ts
├── eslint.config.mjs
├── tsconfig.json
└── package.json
```

Runs as one of the services in the root [docker-compose.yml](../docker-compose.yml).

## Status

**Implemented:** direct-lookup, full-page display only. The page reads `appname`, `code`,
`environment`, and `language` from the URL's query params, calls Error Management UI's public
`GET /api/v1/lookup` API server-side (passing `language` via the `Accept-Language` header, per
[the schema doc](../docs/error-code-schema.md)), and renders a centered card with the `header`,
`code`, and `friendlyMessage` fields. Any missing param, network failure, or non-2xx response
renders a generic fallback card instead of crashing.

**Not yet implemented** — these remain the documented eventual design (see "Integration modes"
and "Display modes" above), just not built in this pass:
- Pre-resolved payload integration mode (host app hands Error UI the JSON directly, skipping
  the API call).
- Inline/toast display mode selected by `alertString` — this pass only renders the full error
  page.
- `REDIRECT_URL` handling.
