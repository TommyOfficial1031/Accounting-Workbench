"""计算引擎：按 AnalysisConfig 编排执行并返回 ComputeResult。"""

from __future__ import annotations

import ast
import math
import operator
from typing import Any, Optional

import pandas as pd

from accounting_backend.compute.aggregators import aggregate, aggregate_series
from accounting_backend.compute.filters import apply_filters
from accounting_backend.compute.groupby import build_group_keys
from accounting_backend.compute.time_dimension import apply_time_range
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import (
    AnalysisConfig,
    ComputeResult,
    DerivedMetric,
    GroupByField,
    Metric,
)

_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
}


def execute(config: AnalysisConfig, df: pd.DataFrame) -> ComputeResult:
    """按 AGENTS.md 7.3 顺序执行：
    校验 → 时间范围 → 筛选 → 分组 → 聚合 → 派生指标 → 排序/TopN(P6)。

    时间范围先于筛选：原型里「高于/低于平均值」的分母是「时间范围内 + 其余条件」的集合。
    占比（原 7.3 第 7 步）已按用户决定砍掉，见 DESIGN_STATE.md §2.6。
    """
    _validate(config, df)

    scanned = int(len(df))
    df, unknown_count = apply_time_range(df, config.time_range)
    ranged = int(len(df))
    df = apply_filters(df, config.filters)
    df = df.reset_index(drop=True)
    filtered = int(len(df))

    group_keys = build_group_keys(df, config.group_by)
    result = aggregate(df, group_keys, config.metrics)
    result = _add_derived(result, config.metrics, config.derived_metrics)

    columns = [str(c) for c in result.columns]
    rows = [
        [_to_jsonable(v) for v in record]
        for record in result.itertuples(index=False, name=None)
    ]
    meta: dict[str, Any] = {
        "unknown_date_count": unknown_count,
        "scanned": scanned,
        "ranged": ranged,
        "filtered": filtered,
        "group_counts": _group_counts(group_keys, config.group_by, filtered),
        "totals": _totals(df, config.metrics, config.derived_metrics),
    }
    return ComputeResult(
        columns=columns,
        rows=rows,
        row_count=len(rows),
        meta=meta,
    )


def _group_counts(
    group_keys: pd.DataFrame, group_by: list[GroupByField], row_count: int
) -> list[int]:
    """每组命中的原始行数（与结果行同序；无分组时只有一行全表计数）。"""
    group_cols = [group.field for group in group_by]
    if not group_cols:
        return [row_count]
    sizes = group_keys.groupby(group_cols, dropna=False, sort=True).size()
    return [int(value) for value in sizes.to_numpy()]


def _totals(
    df: pd.DataFrame, metrics: list[Metric], derived_metrics: list[DerivedMetric]
) -> dict[str, Any]:
    """合计行：对筛选后的整表再聚合一次，并按同样表达式算派生列。"""
    totals: dict[str, Any] = {
        metric.alias: aggregate_series(df[metric.field], metric.agg) for metric in metrics
    }
    for derived in derived_metrics:
        values: dict[str, Any] = {}
        for metric in metrics:
            values[metric.alias] = totals[metric.alias]
            values[metric.id] = totals[metric.alias]
        totals[derived.alias] = _evaluate_expression(derived.expression, values)
    return {name: _to_jsonable(value) for name, value in totals.items()}



def _validate(config: AnalysisConfig, df: pd.DataFrame) -> None:
    if config.time_range.field not in df.columns:
        raise AccountingError("UNKNOWN_FIELD", f"时间字段不存在：{config.time_range.field}")
    if config.time_range.start > config.time_range.end:
        raise AccountingError("INVALID_TIME_RANGE", "开始日期不能晚于结束日期")

    for group in config.group_by:
        if group.field not in df.columns:
            raise AccountingError("UNKNOWN_FIELD", f"分组字段不存在：{group.field}")

    aliases: set[str] = set()
    for metric in config.metrics:
        if metric.field not in df.columns:
            raise AccountingError("UNKNOWN_FIELD", f"指标字段不存在：{metric.field}")
        if metric.alias in aliases:
            raise AccountingError("INVALID_CONFIG", f"指标别名重复：{metric.alias}")
        aliases.add(metric.alias)


def _add_derived(
    result: pd.DataFrame,
    metrics: list[Metric],
    derived_metrics: list[DerivedMetric],
) -> pd.DataFrame:
    valid_names = {m.alias for m in metrics} | {m.id for m in metrics}

    for derived in derived_metrics:
        referenced = _referenced_names(derived.expression)
        for name in referenced:
            if name not in valid_names:
                raise AccountingError(
                    "INVALID_DERIVED_EXPRESSION",
                    f"派生指标「{derived.alias}」引用了未定义的指标：{name}",
                )

        def evaluate_row(row: pd.Series):
            values = {m.alias: row[m.alias] for m in metrics}
            for m in metrics:
                values[m.id] = row[m.alias]
            return _evaluate_expression(derived.expression, values)

        result[derived.alias] = result.apply(evaluate_row, axis=1)

    return result


def _referenced_names(expression: str) -> set[str]:
    tree = ast.parse(expression, mode="eval")
    return {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}


def _evaluate_expression(expression: str, values: dict[str, Any]) -> Optional[float]:
    tree = ast.parse(expression, mode="eval")

    def eval_node(node):
        if isinstance(node, ast.Expression):
            return eval_node(node.body)
        if isinstance(node, ast.BinOp):
            left = eval_node(node.left)
            right = eval_node(node.right)
            if isinstance(node.op, ast.Div):
                return _safe_div(left, right)
            func = _BIN_OPS.get(type(node.op))
            if func is None:
                raise AccountingError(
                    "INVALID_DERIVED_EXPRESSION", f"不支持的运算符：{expression}"
                )
            try:
                return func(left, right)
            except (TypeError, ZeroDivisionError):
                return None
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -eval_node(node.operand)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.Name):
            if node.id not in values:
                raise AccountingError(
                    "INVALID_DERIVED_EXPRESSION", f"引用了未定义的指标：{node.id}"
                )
            return values[node.id]
        raise AccountingError(
            "INVALID_DERIVED_EXPRESSION", f"表达式包含不允许的语法：{expression}"
        )

    return eval_node(tree)


def _safe_div(left: Any, right: Any) -> Optional[float]:
    if right is None or right == 0:
        return None
    try:
        return left / right
    except (ZeroDivisionError, TypeError):
        return None


def _to_jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, pd.Timedelta):
        return str(value)
    if isinstance(value, float):
        return None if (math.isnan(value) or math.isinf(value)) else value
    if hasattr(value, "item"):
        item = value.item()
        if isinstance(item, float) and (math.isnan(item) or math.isinf(item)):
            return None
        return item
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)
