"""Parquet-backed cache for imported datasets.

The full dataset only lives on the Python side (single source of truth). It is
persisted here as parquet and loaded back on demand; the frontend only ever
sees paged preview slices.
"""

from __future__ import annotations

import math

import pandas as pd

from accounting_backend.storage.paths import ensure_dirs, get_dataset_path


def cache_dataframe(dataset_id: str, df: pd.DataFrame) -> str:
    """Persist a DataFrame as parquet and return the file path."""
    ensure_dirs()
    path = get_dataset_path(dataset_id)
    _normalize_for_parquet(df).to_parquet(path, index=False)
    return str(path)


def load_dataframe(dataset_id: str) -> pd.DataFrame:
    """Load a cached parquet dataset back into a DataFrame."""
    return pd.read_parquet(get_dataset_path(dataset_id))


def _normalize_for_parquet(df: pd.DataFrame) -> pd.DataFrame:
    """把 object 列统一转 str，避免混合类型（str/float/None）让 pyarrow 写 parquet 崩溃。"""
    result = df.copy()
    for col in result.columns:
        if result[col].dtype == "object":
            result[col] = result[col].map(_cell_to_str)
    return result


def _cell_to_str(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    return str(value)

