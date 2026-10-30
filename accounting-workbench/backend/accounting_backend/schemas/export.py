"""导出请求的 Pydantic 模型。"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

from accounting_backend.schemas.analysis import ComputeResult


class ExportRequest(BaseModel):
    result: ComputeResult
    format: Literal["xlsx", "xls", "csv"]
    path: Optional[str] = None
    filename: Optional[str] = None
