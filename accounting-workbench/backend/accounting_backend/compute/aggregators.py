"""聚合执行：sum / avg / max / min / median / count。"""

from __future__ import annotations

import pandas as pd

from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import Metric

_NUMERIC_AGGS = {"sum", "avg", "max", "min", "median"}
_AGG_FUNCS = {
    "sum": "sum",
    "avg": "mean",
    "max": "max",
    "min": "min",
    "median": "median",
    "count": "count",
}


def aggregate(
    df: pd.DataFrame, group_keys: pd.DataFrame, metrics: list[Metric]
) -> pd.DataFrame:
    """按 group_keys 分组，计算各指标聚合，返回含分组键与指标列的结果表。"""
    work = group_keys.copy()
    for metric in metrics:
        if metric.field not in df.columns:
            raise AccountingError("UNKNOWN_FIELD", f"指标字段不存在：{metric.field}")
        work[metric.alias] = _prepare_series(df[metric.field], metric.agg).to_numpy()

    group_cols = list(group_keys.columns)

    if group_cols:
        agg_spec = {m.alias: (m.alias, _AGG_FUNCS[m.agg]) for m in metrics}
        result = (
            work.groupby(group_cols, dropna=False, sort=True)
            .agg(**agg_spec)
            .reset_index()
        )
    else:
        result = pd.DataFrame(
            [
                {
                    m.alias: _apply_agg(_prepare_series(df[m.field], m.agg), m.agg)
                    for m in metrics
                }
            ]
        )

    return result[group_cols + [m.alias for m in metrics]]


def aggregate_series(series: pd.Series, agg: str):
    """对单列执行一次聚合（合计行与分组聚合共用，保证口径一致）。"""
    return _apply_agg(_prepare_series(series, agg), agg)


def _prepare_series(series: pd.Series, agg: str) -> pd.Series:
    if agg in _NUMERIC_AGGS:
        return pd.to_numeric(series, errors="coerce")
    return series


def _apply_agg(series: pd.Series, agg: str):
    if agg == "sum":
        return series.sum(skipna=True)
    if agg == "avg":
        return series.mean(skipna=True)
    if agg == "max":
        return series.max(skipna=True)
    if agg == "min":
        return series.min(skipna=True)
    if agg == "median":
        return series.median(skipna=True)
    if agg == "count":
        return int(series.count())
    raise AccountingError("INVALID_AGG", f"不支持的聚合方式：{agg}")
