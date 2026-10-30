"""Pure merge logic for combining multiple project DataFrames.

Implements the field-matching rules from AGENTS.md 7.10:
  - column names are matched exactly after stripping whitespace;
  - distinct fields each occupy their own column;
  - column order follows the base project (most fields, or user-chosen);
  - rows are ordered by each project's field count in descending order.
"""

from __future__ import annotations

import pandas as pd


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of ``df`` with column names stripped of whitespace."""
    return df.rename(columns={col: str(col).strip() for col in df.columns})


def merge_dataframes(dfs: list[pd.DataFrame], base_index: int = 0) -> pd.DataFrame:
    """Merge DataFrames with column alignment and row ordering."""
    normalized = [normalize_columns(df) for df in dfs]

    base = normalized[base_index]
    columns = list(base.columns)
    seen = set(columns)
    for i, df in enumerate(normalized):
        if i == base_index:
            continue
        for col in df.columns:
            if col not in seen:
                seen.add(col)
                columns.append(col)

    order = sorted(range(len(normalized)), key=lambda i: len(normalized[i].columns), reverse=True)
    return pd.concat(
        [normalized[i].reindex(columns=columns) for i in order],
        ignore_index=True,
    )


def sources_by_row(dfs: list[pd.DataFrame], names: list[str]) -> list[str]:
    """Return the source project name for each merged row (aligned to row order)."""
    order = sorted(range(len(dfs)), key=lambda i: len(dfs[i].columns), reverse=True)
    sources: list[str] = []
    for i in order:
        sources.extend([names[i]] * len(dfs[i]))
    return sources
