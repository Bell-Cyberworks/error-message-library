# EML — JavaScript/TypeScript Library

Idiomatic JS/TS client implementing the [shared library contract](../README.md) for Node.js and browser apps.

## Conceptual usage

Illustrative only — not real code yet.

```ts
// one-time setup, per app
EmlClient.configure({ appName: "my-app", baseUrl: "http://error-management-ui:8080" });

// call site — nothing else required
throw new EmlError("SOME_CODE");
```

Throwing (or extending) `EmlError` is intercepted so the API call, logging, and JSON resolution happen automatically, using the code's `LANGUAGE` from the current app/request context.

## Planned Structure

```
javascript/
├── src/
├── tests/
├── package.json
└── README.md
```

## Status

No implementation yet.
