"""导出记录的数据结构与校验（POST /api/exports 的请求体 / 列表响应）。"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ExportRecordCreate(BaseModel):
    name: str = Field(min_length=1, description="文件或文件夹名")
    kind: Literal["file", "folder"] = "file"
    path: str = Field(min_length=1, description="写盘的绝对路径")
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    creator: Optional[str] = None


class ExportRecord(BaseModel):
    id: str
    name: str
    kind: Literal["file", "folder"]
    path: str
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    creator: Optional[str] = None
    exported_at: str
    created_at: str


class ExportRecordList(BaseModel):
    items: list[ExportRecord] = Field(default_factory=list)
    total: int = 0
