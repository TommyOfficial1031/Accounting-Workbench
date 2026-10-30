"""合并规则测试（AGENTS.md 7.10）。"""

from __future__ import annotations

import pandas as pd

from accounting_backend.data.merger import merge_dataframes, sources_by_row


def _df(columns, rows):
    return pd.DataFrame(rows, columns=columns)


def test_merge_six_and_four_fields():
    a = _df(
        ["账单时间", "寄件网点", "目的省份", "公斤段", "现价", "结算重量"],
        [["2026-10-01", "A", "广东", "0-1kg", 100, 10]],
    )
    b = _df(
        ["账单时间", "寄件网点", "目的省份", "结算重量"],
        [["2026-10-02", "B", "江苏", 20]],
    )
    merged = merge_dataframes([a, b], base_index=0)
    # 列序以字段最多的 a 为准
    assert list(merged.columns) == ["账单时间", "寄件网点", "目的省份", "公斤段", "现价", "结算重量"]
    # 字段多的 a 行在上
    assert merged.iloc[0]["寄件网点"] == "A"
    assert merged.iloc[1]["寄件网点"] == "B"
    # b 缺失的列填充 NaN
    assert pd.isna(merged.iloc[1]["公斤段"])


def test_merge_equal_fields_uses_base():
    a = _df(["账单时间", "寄件网点"], [["2026-10-01", "A"]])
    b = _df(["账单时间", "目的省份"], [["2026-10-02", "广东"]])
    # 字段数相同，base_index=1 → 列序以 b 为准
    merged = merge_dataframes([a, b], base_index=1)
    assert list(merged.columns) == ["账单时间", "目的省份", "寄件网点"]


def test_merge_strips_whitespace():
    a = _df([" 账单时间 ", "寄件网点"], [["2026-10-01", "A"]])
    b = _df(["账单时间", "寄件网点"], [["2026-10-02", "B"]])
    merged = merge_dataframes([a, b], base_index=0)
    # 前后空格去掉后精确匹配到同一列
    assert list(merged.columns) == ["账单时间", "寄件网点"]
    assert merged.iloc[0]["账单时间"] == "2026-10-01"
    assert merged.iloc[1]["账单时间"] == "2026-10-02"


def test_sources_by_row():
    a = _df(["账单时间", "寄件网点", "目的省份", "公斤段"], [["x", "A", "y", "z"]] * 2)
    b = _df(["账单时间", "寄件网点"], [["x", "B"]] * 3)
    sources = sources_by_row([a, b], ["项目A", "项目B"])
    # 字段多的 a（4 字段）在上
    assert sources == ["项目A", "项目A", "项目B", "项目B", "项目B"]
