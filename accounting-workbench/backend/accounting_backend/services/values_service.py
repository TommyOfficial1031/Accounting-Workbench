"""取值编排：加载工作副本并按字段返回候选值。"""

from __future__ import annotations

from typing import Optional

from accounting_backend.compute.field_values import cascade_values, distinct_values
from accounting_backend.schemas.analysis import TimeRange
from accounting_backend.services import edit_service


def list_values(
    dataset_id: str,
    fields: list[str],
    limit: int,
    time_range: Optional[TimeRange] = None,
) -> dict[str, list[str]]:
    """返回每个字段的候选取值；time_range 可用于只统计该范围内的数据。"""
    df = edit_service.get_frame(dataset_id)
    return distinct_values(df, fields, limit, time_range)


def list_cascade_values(
    dataset_id: str,
    parent_field: Optional[str],
    child_field: Optional[str],
    limit: int,
    time_range: Optional[TimeRange] = None,
) -> dict[str, list[str]]:
    """级联候选取值（父值 → 子值集合）；两个字段没成对给出时返回空映射。"""
    if not parent_field or not child_field:
        return {}
    df = edit_service.get_frame(dataset_id)
    return cascade_values(df, parent_field, child_field, limit, time_range)
