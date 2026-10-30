"""数据集字段取值：给「分组筛选条件 / 指标」这类下拉勾选框提供候选值。"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from fastapi import APIRouter

from accounting_backend.config import API_PREFIX
from accounting_backend.schemas.analysis import TimeRange
from accounting_backend.services import values_service

router = APIRouter(prefix=API_PREFIX)


class ValuesRequest(BaseModel):
    """按字段列出一批候选值。"""

    dataset_id: str
    fields: list[str] = Field(default_factory=list)
    limit: int = Field(200, ge=1, le=2000, description="每个字段最多返回多少个取值")
    time_range: Optional[TimeRange] = Field(
        default=None, description="只统计该时间范围内的取值（不传则统计全表）"
    )
    parent_field: Optional[str] = Field(
        default=None, description="级联父字段（不传则不算级联映射）"
    )
    child_field: Optional[str] = Field(
        default=None, description="级联子字段（与 parent_field 成对出现）"
    )


class ValuesResult(BaseModel):
    values: dict[str, list[str]]
    #: 父字段取值 → 该父值下出现过的子字段取值（第 11 轮 A①「省份 → 该省公斤段」）
    cascade: dict[str, list[str]] = Field(default_factory=dict)


@router.post("/values", response_model=ValuesResult)
def values_endpoint(request: ValuesRequest) -> ValuesResult:
    """返回每个字段去重后的取值（按字符串字典序，最多 limit 个）。"""
    values = values_service.list_values(
        request.dataset_id, request.fields, request.limit, request.time_range
    )
    cascade = values_service.list_cascade_values(
        request.dataset_id,
        request.parent_field,
        request.child_field,
        request.limit,
        request.time_range,
    )
    return ValuesResult(values=values, cascade=cascade)
