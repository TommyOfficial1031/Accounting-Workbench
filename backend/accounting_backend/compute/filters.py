"""筛选条件执行：FilterGroup 的 AND/OR 逻辑与各类比较运算。

运算符集合与 `_proto/shell-demo.html` 分析页一一对应：
文本 eq/ne/startsWith/endsWith/contains/notContains，
数值 eq/ne/gt/ge/lt/le/between，以及「高于/低于平均值」。

「高于/低于平均值」的分母是**已应用其余条件后的集合**（原型口径），
因此它们总在其余条件之后以 AND 方式叠加，不参与 FilterGroup.logic。
"""

from __future__ import annotations

import pandas as pd

from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import FilterCondition, FilterGroup

_POOL_OPS = {"aboveAvg", "belowAvg"}


def apply_filters(df: pd.DataFrame, group: FilterGroup) -> pd.DataFrame:
    """按 FilterGroup 过滤 DataFrame，返回过滤后的视图。"""
    if not group.conditions:
        return df

    plain = [c for c in group.conditions if c.op not in _POOL_OPS]
    pool_ops = [c for c in group.conditions if c.op in _POOL_OPS]

    result = df
    if plain:
        result = result[_combine(result, plain, group.logic)]
    for condition in pool_ops:
        result = result[_apply_pool_condition(result, condition)]
    return result


def _combine(
    df: pd.DataFrame, conditions: list[FilterCondition], logic: str
) -> pd.Series:
    mask: pd.Series | None = None
    for condition in conditions:
        cond_mask = _apply_condition(df, condition)
        if mask is None:
            mask = cond_mask
        elif logic == "AND":
            mask = mask & cond_mask
        else:
            mask = mask | cond_mask
    if mask is None:
        return pd.Series(True, index=df.index)
    return mask.fillna(False).astype(bool)


def _numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _text(series: pd.Series) -> pd.Series:
    return series.astype(str)


def _apply_condition(df: pd.DataFrame, condition: FilterCondition) -> pd.Series:
    field = condition.field
    if field not in df.columns:
        raise AccountingError("UNKNOWN_FIELD", f"筛选字段不存在：{field}")

    series = df[field]
    value = condition.value
    op = condition.op

    if op == "eq":
        return series == value
    if op == "ne":
        return series != value
    if op == "in":
        return series.isin(value if isinstance(value, (list, tuple, set)) else [value])
    if op == "not_in":
        return ~series.isin(value if isinstance(value, (list, tuple, set)) else [value])
    if op == "startsWith":
        return _text(series).str.startswith(str(value), na=False)
    if op == "endsWith":
        return _text(series).str.endswith(str(value), na=False)
    if op == "contains":
        return _text(series).str.contains(str(value), na=False, regex=False)
    if op == "notContains":
        return ~_text(series).str.contains(str(value), na=False, regex=False)
    if op == "between":
        low, high = _bounds(value)
        return _numeric(series).between(low, high)

    numbers = _numeric(series)
    if op == "gt":
        return numbers > _number(value, op)
    if op == "ge":
        return numbers >= _number(value, op)
    if op == "lt":
        return numbers < _number(value, op)
    if op == "le":
        return numbers <= _number(value, op)

    raise AccountingError("INVALID_OP", f"不支持的筛选运算符：{op}")


def _apply_pool_condition(df: pd.DataFrame, condition: FilterCondition) -> pd.Series:
    """高于/低于平均值：分母取当前已过滤集合的平均值。"""
    field = condition.field
    if field not in df.columns:
        raise AccountingError("UNKNOWN_FIELD", f"筛选字段不存在：{field}")

    numbers = _numeric(df[field])
    valid = numbers.dropna()
    if valid.empty:
        return pd.Series(False, index=df.index)

    average = valid.mean()
    if condition.op == "aboveAvg":
        return numbers > average
    return numbers < average


def _number(value: object, op: str) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise AccountingError(
            "INVALID_VALUE", f"运算符 {op} 需要数值，实际收到：{value!r}"
        ) from exc


def _bounds(value: object) -> tuple[float, float]:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise AccountingError(
            "INVALID_VALUE", f"「介于」需要 [下限, 上限] 两个值，实际收到：{value!r}"
        )
    low = _number(value[0], "between")
    high = _number(value[1], "between")
    return (low, high) if low <= high else (high, low)
