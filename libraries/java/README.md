# EML — Java Library

Idiomatic Java client implementing the [shared library contract](../README.md).

## Interception: AOP

Unlike a manual try/catch-and-call approach, this library uses **AOP**: an aspect around the EML error type does the API call, logging, and JSON construction. The throw site itself calls nothing else — the aspect is what makes `throw new EmlError(...)` alone sufficient.

## Conceptual usage

Illustrative only — not real code yet.

```java
// one-time setup, per app (e.g. Spring config)
EmlClient.configure("my-app", "http://error-management-ui:8080");

// call site — nothing else required, the aspect handles the rest
throw new EmlError("SOME_CODE");
```

The aspect resolves `APPNAME + CODE + LANGUAGE` against the Management UI's API and builds the resulting JSON (per the [schema](../../docs/error-code-schema.md)), which is then either handed to Error UI for rendering or returned as-is as the raw API-to-API error response.

## Planned Structure

```
java/
├── src/main/java/
├── src/test/java/
├── pom.xml (or build.gradle)
└── README.md
```

## Status

No implementation yet.
