"""分组执行：按 GroupByField 生成分组键，支持按天时间粒度。"""

from __future__ import annotations

import pandas as pd

from accounting_backend.compute.time_dimension import to_day_group_key
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import GroupByField


def build_group_keys(df: pd.DataFrame, group_by: list[GroupByField]) -> pd.DataFrame:
    """为每个分组字段生成分组键，返回与 df 等长的键 DataFrame。"""
    keys: dict[str, pd.Series] = {}
    for field in group_by:
        if field.field not in df.columns:
            raise AccountingError("UNKNOWN_FIELD", f"分组字段不存在：{field.field}")
        if field.time_granularity == "day":
            keys[field.field] = to_day_group_key(df[field.field])
        else:
            keys[field.field] = df[field.field].reset_index(drop=True)
    return pd.DataFrame(keys)
