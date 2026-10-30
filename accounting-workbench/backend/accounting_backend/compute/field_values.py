"""字段取值：给分析页的字段选择器与「取值多选」提供候选（可按时间范围收窄）。

纯函数：输入 DataFrame + 字段名，输出去重后的字符串取值。
第 11 轮 A① 追加 ``cascade_values``：父字段取值 → 该父值下出现过的子字段取值，
用来实现「省份 → 该省公斤段」的级联勾选（每省各自的公斤段集合）。
"""

from __future__ import annotations

from typing import Optional

import pandas as pd

from accounting_backend.compute.time_dimension import apply_time_range
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import TimeRange


def _scoped(df: pd.DataFrame, fields: list[str], time_range: Optional[TimeRange]) -> pd.DataFrame:
    """校验字段存在，并按时间范围收窄（范围内无数据不报错，返回空表）。"""
    missing = [field for field in fields if field not in df.columns]
    if missing:
        raise AccountingError(
            "MISSING_FIELDS",
            f"缺少字段：{'、'.join(missing)}",
            {"missing": missing},
        )
    if time_range is None:
        return df
    if time_range.field not in df.columns:
        raise AccountingError("UNKNOWN_FIELD", f"时间字段不存在：{time_range.field}")
    scoped, _ = apply_time_range(df, time_range)
    return scoped


def _distinct(series: pd.Series, limit: int) -> list[str]:
    """一列去重后的非空字符串取值（字典序，最多 limit 个）。"""
    uniques = {str(value) for value in series.dropna().unique() if str(value) != ""}
    return sorted(uniques)[:limit]


def distinct_values(
    df: pd.DataFrame,
    fields: list[str],
    limit: int,
    time_range: Optional[TimeRange] = None,
) -> dict[str, list[str]]:
    """返回每个字段去重后的取值（字符串字典序，最多 limit 个）。

    时间范围只影响候选值，不改变字段是否存在；范围内无数据的字段返回空列表，
    前端据此把该字段置灰（原型行为）。
    """
    scoped = _scoped(df, fields, time_range)
    return {field: _distinct(scoped[field], limit) for field in fields}


def cascade_values(
    df: pd.DataFrame,
    parent_field: str,
    child_field: str,
    limit: int,
    time_range: Optional[TimeRange] = None,
) -> dict[str, list[str]]:
    """父字段取值 → 该父值下真实出现过的子字段取值（第 11 轮 A①）。

    例：``{"安徽省": ["0-60", "60-150"], "浙江省": ["0-60"]}`` —— 浙江省只出现 0-60，
    级联弹层里就不会给它多列出别的省份才有的公斤段。
    """
    scoped = _scoped(df, [parent_field, child_field], time_range)
    parents = _distinct(scoped[parent_field], limit=max(limit, 1_000))
    parent_text = scoped[parent_field].astype(str)
    result: dict[str, list[str]] = {}
    for parent in parents:
        children = scoped.loc[parent_text == parent, child_field]
        result[parent] = _distinct(children, limit)
    return result
