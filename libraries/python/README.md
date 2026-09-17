# EML — Python Library

Idiomatic Python client implementing the [shared library contract](../README.md).

## Conceptual usage

Illustrative only — not real code yet.

```python
# one-time setup, per app
eml.configure(app_name="my-app", base_url="http://error-management-ui:8080")

# call site — nothing else required
raise EmlError("SOME_CODE")
```

Raising (or subclassing) `EmlError` is intercepted so the API call, logging, and JSON resolution happen automatically, using the code's `LANGUAGE` from the current app/request context.

## Planned Structure

```
python/
├── src/
├── tests/
├── pyproject.toml
└── README.md
```

## Status

No implementation yet.
