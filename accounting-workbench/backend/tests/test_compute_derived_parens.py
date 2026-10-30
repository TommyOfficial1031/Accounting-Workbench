"""派生指标带括号的求值（分析页「指标框」的表达式就长这样）。

分析页 2026-10-27 改成指标框（一行表达式、允许嵌套括号）后，前端会把括号
原样拼进 `derived_metrics[].expression`，所以后端必须能算 `(m1 - m2) / m1`
这类嵌套括号，并且保持四则运算优先级、分母为 0 时留空。
"""

from __future__ import annotations

import pandas as pd
import pytest

from accounting_backend.compute.engine import execute
from accounting_backend.schemas.analysis import (
    AnalysisConfig,
    DerivedMetric,
    FilterGroup,
    Metric,
    TimeRange,
)


def _df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "账单时间": ["2026-10-01", "2026-10-01", "2026-10-02"],
            "网点": ["A", "A", "B"],
            "原价": [120.0, 80.0, 60.0],
            "现价": [100.0, 60.0, 30.0],
        }
    )


def _config(derived: list[DerivedMetric]) -> AnalysisConfig:
    return AnalysisConfig(
        dataset_id="ds",
        time_range=TimeRange(start="2026-10-01", end="2026-10-31"),
        filters=FilterGroup(),
        group_by=[],
        metrics=[
            Metric(id="m1", field="原价", agg="sum", alias="原价合计"),
            Metric(id="m2", field="现价", agg="sum", alias="现价合计"),
            Metric(id="m3", field="原价", agg="count", alias="原价计数"),
        ],
        derived_metrics=derived,
    )


def test_parenthesised_derived_expression():
    """`(原价合计 - 现价合计) ÷ 原价合计`：括号必须真的改变结合顺序。"""
    config = _config(
        [DerivedMetric(id="d1", expression="(m1 - m2) / m1", alias="计算结果1")]
    )
    result = execute(config, _df())

    assert result.columns[-1] == "计算结果1"
    assert result.rows[0][-1] == pytest.approx((260.0 - 190.0) / 260.0)
    assert result.meta["totals"]["计算结果1"] == pytest.approx((260.0 - 190.0) / 260.0)


def test_nested_parentheses():
    """嵌套括号：(m1 - m2) * (m3 + 1)。"""
    config = _config(
        [
            DerivedMetric(
                id="d1",
                expression="(m1 - m2) * (m3 + 1)",
                alias="计算结果1",
            )
        ]
    )
    result = execute(config, _df())

    assert result.rows[0][-1] == pytest.approx((260.0 - 190.0) * (3 + 1))


def test_precedence_with_parens():
    """`m1 - m2 / m3` 与 `(m1 - m2) / m3` 必须算出不同结果。"""
    no_parens = execute(
        _config([DerivedMetric(id="d1", expression="m1 - m2 / m3", alias="a")]),
        _df(),
    ).rows[0][-1]
    parens = execute(
        _config([DerivedMetric(id="d1", expression="(m1 - m2) / m3", alias="a")]),
        _df(),
    ).rows[0][-1]

    assert no_parens == pytest.approx(260.0 - 190.0 / 3)
    assert parens == pytest.approx((260.0 - 190.0) / 3)


def test_parenthesised_denominator_zero_stays_empty():
    """分母为 0 时留空，不输出 inf / NaN（AGENTS.md 禁止事项 12）。"""
    config = _config(
        [
            DerivedMetric(
                id="d1",
                expression="(m1 - m2) / (m1 - m1)",
                alias="计算结果1",
            )
        ]
    )
    result = execute(config, _df())

    assert result.rows[0][-1] is None
    assert result.meta["totals"]["计算结果1"] is None


def test_paren_expression_referenced_ids():
    """括号不参与「引用校验」：引用了没定义的指标照旧报错。"""
    config = _config(
        [DerivedMetric(id="d1", expression="(m1 - m9) / m1", alias="计算结果1")]
    )
    with pytest.raises(Exception) as excinfo:
        execute(config, _df())
    assert "m9" in str(excinfo.value)
