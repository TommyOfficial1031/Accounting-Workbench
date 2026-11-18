"""计算引擎测试：合计行、分组命中行数、扫描/范围内/筛选后行数与时间范围先行。"""

from __future__ import annotations

import pandas as pd

from accounting_backend.compute.engine import execute
from accounting_backend.schemas.analysis import (
    AnalysisConfig,
    DerivedMetric,
    FilterCondition,
    FilterGroup,
    GroupByField,
    Metric,
    TimeRange,
)


def _df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "账单时间": ["2026-10-01", "2026-10-01", "2026-10-02", "2026-09-01", "坏日期"],
            "网点": ["A", "B", "A", "C", "A"],
            "省份": ["广东", "广西", "广东", "广东", "广东"],
            "重量": [10, 20, 30, 40, 50],
            "现价": [100, 200, 300, 400, 500],
            "原价": [120, 220, 320, 420, 0],
        }
    )


def _config(**overrides) -> AnalysisConfig:
    payload = {
        "dataset_id": "ds",
        "time_range": TimeRange(start="2026-10-01", end="2026-10-31"),
        "filters": FilterGroup(),
        "group_by": [GroupByField(field="网点")],
        "metrics": [Metric(id="m1", field="重量", agg="sum", alias="货量")],
        "derived_metrics": [],
    }
    payload.update(overrides)
    return AnalysisConfig(**payload)


def test_meta_counts_scanned_ranged_filtered():
    result = execute(_config(), _df())

    # 扫描 5 行 → 时间范围内 4 行（2026-09-01 越界，未知日期按 AGENTS 7.6 保留）→ 筛选后 4 行
    assert result.meta["scanned"] == 5
    assert result.meta["ranged"] == 4
    assert result.meta["filtered"] == 4
    assert result.meta["unknown_date_count"] == 1


def test_meta_counts_respect_filters():
    config = _config(
        filters=FilterGroup(
            conditions=[FilterCondition(field="网点", op="in", value=["A", "B"])]
        )
    )
    result = execute(config, _df())

    assert result.meta["filtered"] == 4
    assert result.columns == ["网点", "货量"]
    assert sorted(row[0] for row in result.rows) == ["A", "B"]


def test_totals_regardless_of_grouping():
    result = execute(_config(), _df())

    # 范围内只有 A（10 + 30 + 50 = 90）与 B（20）
    assert result.meta["totals"]["货量"] == 110
    assert result.meta["group_counts"] == [3, 1]


def test_totals_follow_aggregation_semantics():
    config = _config(
        group_by=[],
        metrics=[Metric(id="m1", field="重量", agg="avg", alias="均重")],
        derived_metrics=[DerivedMetric(id="d1", expression="均重 / 2", alias="半均重")],
    )
    result = execute(config, _df())

    assert result.row_count == 1
    assert result.meta["group_counts"] == [4]
    assert result.meta["totals"]["均重"] == 27.5
    assert result.meta["totals"]["半均重"] == 13.75


def test_derived_metric_division_by_zero_is_empty_not_inf():
    config = _config(
        group_by=[],
        metrics=[Metric(id="m1", field="原价", agg="sum", alias="原价合计")],
        derived_metrics=[DerivedMetric(id="d1", expression="1 / 原价合计", alias="倒数")],
    )
    result = execute(config, _df())

    # 5 行原价合计 1080 ≠ 0，倒数可算；再单独验证分母为 0 的分组
    assert result.meta["totals"]["倒数"] is not None

    zero_config = _config(
        filters=FilterGroup(
            conditions=[FilterCondition(field="网点", op="eq", value="D")]
        ),
        group_by=[],
        metrics=[Metric(id="m1", field="原价", agg="sum", alias="原价合计")],
        derived_metrics=[DerivedMetric(id="d1", expression="1 / 原价合计", alias="倒数")],
    )
    zero_result = execute(zero_config, _df())
    assert zero_result.meta["totals"]["倒数"] is None


def test_time_range_applies_before_average_filters():
    # 范围内 4 行（10/20/30/50，未知日期那行保留），平均值 27.5 → 高于平均值只有 30 和 50
    config = _config(
        filters=FilterGroup(
            conditions=[FilterCondition(field="重量", op="aboveAvg", value=None)]
        )
    )
    result = execute(config, _df())

    assert result.meta["ranged"] == 4
    assert result.meta["filtered"] == 2
    assert result.meta["totals"]["货量"] == 80
