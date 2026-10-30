"""分组执行测试：普通分组 + 按天分组 + 未知日期。"""

from __future__ import annotations

import pandas as pd

from accounting_backend.compute.groupby import build_group_keys
from accounting_backend.compute.time_dimension import to_day_group_key
from accounting_backend.schemas.analysis import GroupByField


def test_build_group_keys_normal():
    df = pd.DataFrame({"网点": ["A", "B", "A"], "重量": [1, 2, 3]})
    keys = build_group_keys(df, [GroupByField(field="网点")])
    assert list(keys["网点"]) == ["A", "B", "A"]


def test_to_day_group_key_and_unknown():
    series = pd.Series(["2026-10-01", "2026-10-02", "bad-date", "2026-10-01"])
    assert list(to_day_group_key(series)) == [
        "2026-10-01",
        "2026-10-02",
        "未知日期",
        "2026-10-01",
    ]


def test_build_group_keys_day_granularity():
    df = pd.DataFrame(
        {
            "账单时间": ["2026-10-01", "2026-10-01 08:00", "2026-10-02", "bad"],
        }
    )
    keys = build_group_keys(
        df, [GroupByField(field="账单时间", time_granularity="day")]
    )
    assert list(keys["账单时间"]) == [
        "2026-10-01",
        "2026-10-01",
        "2026-10-02",
        "未知日期",
    ]
