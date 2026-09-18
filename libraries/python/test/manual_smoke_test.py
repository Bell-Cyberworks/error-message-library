"""Manual, pytest-free smoke test for the EML Python client.

Mirrors the Java library's ``ManualSmokeTest`` and the JavaScript library's
``manual-smoke-test.ts`` in structure and intent — run directly against a real, running
``error-management-ui`` instance, rather than mocked. Run it multiple times with different
``sys.argv[1]`` codes (a known-existing code, a brand-new/never-before-seen code to exercise
server-side auto-registration, etc.) and different environment variable combinations (e.g.
omitting one to exercise the no-network-attempt validation failure, or pointing ``EML_API`` at
an unreachable host to exercise the local fallback) — one scenario per run, rather than
scripting multiple scenarios into a single run.

Run directly via ``python3`` from the ``libraries/python/`` directory:

    APPNAME=my-app EML_API=http://localhost:3000 ENVIRONMENT=dev \\
      python3 test/manual_smoke_test.py SOME_CODE

There is zero guarantee `pip install -e .` / `uv pip install -e .` has been run before this
script executes, so the `sys.path` adjustment below makes `src/eml_client` importable directly
without an install step (the package has zero runtime dependencies, so this works reliably).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Make `src/eml_client` importable without requiring a prior `pip install -e .` /
# `uv pip install -e .` — this script is a throwaway verification tool, not part of the
# published package, so it reaches into `src/` directly rather than assuming an install step.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from eml_client import EMLError  # noqa: E402 — must follow the sys.path adjustment above.


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 test/manual_smoke_test.py <errorCode>", file=sys.stderr)
        sys.exit(1)

    code = sys.argv[1]

    print(
        f"CONFIG APPNAME={os.environ.get('APPNAME')} "
        f"EML_API={os.environ.get('EML_API')} "
        f"ENVIRONMENT={os.environ.get('ENVIRONMENT')}"
    )

    try:
        raise EMLError(code)
    except EMLError as e:
        print(
            "RESULT"
            f" resolved={e.resolved}"
            f' code="{e.code}"'
            f' appname="{e.appname}"'
            f' environment="{e.environment}"'
            f' language="{e.language}"'
            f' header="{e.header}"'
            f' description="{e.description}"'
            f' friendly_message="{e.friendly_message}"'
            f' category="{e.category}"'
            f' error_category="{e.error_category}"'
            f" http_code={e.http_code}"
            f' alert_string="{e.alert_string}"'
            f' redirect_url="{e.redirect_url}"'
            f' event_id="{e.event_id}"'
            f' event_category="{e.event_category}"'
            f" trans_id_display={e.trans_id_display}"
            f" retry_enabled={e.retry_enabled}"
            f" error_code_display={e.error_code_display}"
            f" needs_authoring={e.needs_authoring}"
            f' exception_message="{e}"'
        )


if __name__ == "__main__":
    main()
