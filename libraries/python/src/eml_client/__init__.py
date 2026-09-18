"""EML — Python client implementing the shared library contract.

Public entry point. Only ``EMLError`` is exported; everything else in this package
(``config``, ``lookup_client``, ``lookup_result``) is an internal implementation detail.
"""

from .error import EMLError

__all__ = ["EMLError"]
