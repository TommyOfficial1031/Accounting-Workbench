"""时间维度：日期解析、时间范围筛选、按天分组与未知日期处理。"""

from __future__ import annotations

import re
import warnings
from typing import Optional

import pandas as pd

from accounting_backend.schemas.analysis import TimeRange
from accounting_backend.schemas.dataset import TimeRangeInfo

#: 优先使用的时间字段（与 ``constants.PREDEFINED_FIELDS`` 的第一个字段一致）。
TIME_FIELD = "账单时间"
#: 「看起来是日期」的判据：``2026-10-08`` / ``2026/10/8`` / ``2026年10月8日`` / ``2026.10.08``。
_DATE_LIKE = re.compile(r"\d{4}\s*[-/年月.]\s*\d{1,2}")
#: 识别时间字段时抽样多少个非空值（10 万行时不必全列正则）。
_DATE_SAMPLE = 200


def parse_dates(series: pd.Series) -> pd.Series:
    """解析日期列，失败返回 NaT。"""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return pd.to_datetime(series, errors="coerce", format="mixed")


def column_looks_like_date(series: pd.Series, sample: int = _DATE_SAMPLE) -> bool:
    """判断一列是否是日期列（真 datetime，或过半抽样值长得像日期）。

    数值 / 布尔列一律不算：``pd.to_datetime(100)`` 会得到 1970 年的纳秒时间戳，
    这种「假日期」会把时间范围识别成 1970-01-01（用户要的是识别不出来就不预填）。
    """
    if pd.api.types.is_datetime64_any_dtype(series):
        return True
    if pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series):
        return False
    values = series.dropna().astype(str).head(sample)
    if values.empty:
        return False
    matched = sum(1 for value in values if _DATE_LIKE.search(value))
    return matched > 0 and matched * 2 >= len(values)


def pick_time_field(df: pd.DataFrame) -> Optional[str]:
    """挑时间字段：优先「账单时间」，否则第一个日期列；都没有返回 ``None``。"""
    if TIME_FIELD in df.columns:
        return TIME_FIELD
    for column in df.columns:
        if column_looks_like_date(df[column]):
            return str(column)
    return None


def detect_time_range(df: pd.DataFrame) -> TimeRangeInfo:
    """识别时间字段并算出 min~max 日期（第 11 轮 C）。

    没有时间列 / 整列解析失败都不报错，返回全 ``None`` 的 ``TimeRangeInfo``
    （前端据此时预设仍显示「自定义」但不预填范围）。
    """
    field = pick_time_field(df)
    if field is None:
        return TimeRangeInfo()
    parsed = parse_dates(df[field])
    valid = parsed.dropna()
    if valid.empty:
        return TimeRangeInfo(field=field, rows=0)
    return TimeRangeInfo(
        field=field,
        start=pd.Timestamp(valid.min()).strftime("%Y-%m-%d"),
        end=pd.Timestamp(valid.max()).strftime("%Y-%m-%d"),
        rows=int(len(valid)),
    )


def apply_time_range(df: pd.DataFrame, time_range: TimeRange) -> tuple[pd.DataFrame, int]:
    """按时间范围筛选；NaT 行不参与比较、一律保留，并统计未知日期行数。"""
    parsed = parse_dates(df[time_range.field])
    day = parsed.dt.normalize()
    start = pd.Timestamp(time_range.start)
    end = pd.Timestamp(time_range.end)

    in_range = (day >= start) & (day <= end)
    unknown_count = int(parsed.isna().sum())
    keep = in_range | parsed.isna()
    return df[keep], unknown_count


def to_day_group_key(series: pd.Series) -> pd.Series:
    """把日期列按天归一化为字符串，NaT 映射为「未知日期」。"""
    parsed = parse_dates(series)
    strings = parsed.dt.strftime("%Y-%m-%d")
    return strings.where(parsed.notna(), "未知日期")
