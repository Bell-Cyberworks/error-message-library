# EML — Go Library

Idiomatic Go client implementing the [shared library contract](../README.md).

Go has no exceptions to intercept, so the idiomatic shape is a constructor that does the work at creation time rather than at a later "throw":

## Conceptual usage

Illustrative only — not real code yet.

```go
// one-time setup, per app
eml.Configure(eml.Config{AppName: "my-app", BaseURL: "http://error-management-ui:8080"})

// call site — nothing else required
return eml.NewError("SOME_CODE")
```

`eml.NewError` performs the API call, logging, and JSON resolution immediately, returning a Go `error` whose resolved fields (per the [schema](../../docs/error-code-schema.md)) are accessible on the concrete type, using the code's `LANGUAGE` from the current app/request context.

## Planned Structure

```
go/
├── eml/
├── eml_test.go
├── go.mod
└── README.md
```

## Status

No implementation yet.
