"""编辑指令的 Pydantic 模型（PATCH /api/dataset/{id} 的请求/响应契约）。"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from accounting_backend.schemas.dataset import Dataset

EditOp = Literal[
    "set_cells",
    "paste",
    "cut",
    "insert_rows",
    "insert_cols",
    "delete_rows",
    "delete_cols",
    "undo",
    "redo",
    "reset",
]


class CellEdit(BaseModel):
    row: int
    col: int
    value: Any


class EditRequest(BaseModel):
    op: EditOp
    payload: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: Optional[str] = None


class EditResponse(BaseModel):
    success: bool
    row_count: int
    col_count: int
    warnings: list[str] = Field(default_factory=list)
    can_undo: bool
    can_redo: bool
    dataset: Optional[Dataset] = None
