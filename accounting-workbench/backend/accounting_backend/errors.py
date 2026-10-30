"""Custom exception hierarchy for the accounting backend."""

from __future__ import annotations

from typing import Optional


class AccountingError(Exception):
    """Base error carrying a machine-readable code and a user-facing message."""

    def __init__(
        self,
        code: str,
        message: str,
        details: Optional[dict] = None,
        status_code: int = 400,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details
        self.status_code = status_code
