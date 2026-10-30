"""三条固定规则数值测试。

期望值全部由手工推演得出（不借助 pandas 聚合函数），推导过程见各函数注释。
"""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from accounting_backend.compute.engine import execute
from accounting_backend.compute.fixed_rules import build_analysis_config
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import (
    AnalysisConfig,
    DerivedMetric,
    Metric,
    TimeRange,
)

_COLUMNS = [
    "账单时间", "寄件所属一级网点", "目的所属省份", "公斤段",
    "物品来源", "是否剔除", "结算重量", "现价", "原价", "产品类型", "订单来源",
]

# 样本 6 行。分组维度 = (账单时间, 网点, 省份, 公斤段, 物品来源, 是否剔除)。
# 手工推演（按字典序排序）得到 5 组：
#   G1 = (10-01, A, 广东, 0-1kg, 电商, 否) -> 第1、2行
#   G2 = (10-01, A, 广东, 1-2kg, 电商, 否) -> 第3行
#   G3 = (10-01, B, 广西, 0-1kg, 电商, 否) -> 第4行
#   G4 = (10-01, B, 广西, 0-1kg, 电商, 是) -> 第5行
#   G5 = (10-02, A, 广东, 0-1kg, 电商, 否) -> 第6行
_ROWS = [
    ["2026-10-01", "A", "广东", "0-1kg", "电商", "否", 10, 100, 120, "标准", "电商"],
    ["2026-10-01", "A", "广东", "0-1kg", "电商", "否", 5, 40, 50, "标准", "电商"],
    ["2026-10-01", "A", "广东", "1-2kg", "电商", "否", 20, 220, 240, "标准", "电商"],
    ["2026-10-01", "B", "广西", "0-1kg", "电商", "否", 15, 150, 180, "特惠", "线下"],
    ["2026-10-01", "B", "广西", "0-1kg", "电商", "是", 8, 60, 70, "特惠", "线下"],
    ["2026-10-02", "A", "广东", "0-1kg", "电商", "否", 12, 120, 140, "标准", "电商"],
]

_TIME_RANGE = TimeRange(start=date(2026, 10, 1), end=date(2026, 10, 2))


def _df():
    return pd.DataFrame(_ROWS, columns=_COLUMNS)


def _run(rule_name):
    config = build_analysis_config(rule_name, "test-dataset", _TIME_RANGE)
    return execute(config, _df())


def _column(result, name):
    index = result.columns.index(name)
    return [row[index] for row in result.rows]


def test_fixed_rule_cargo_volume():
    # 网点货量分析：货量 = sum(结算重量)。
    # G1: 10+5=15, G2: 20, G3: 15, G4: 8, G5: 12
    result = _run("网点货量分析")
    assert _column(result, "货量") == [15, 20, 15, 8, 12]


def test_fixed_rule_unit_price():
    # 网点单公斤价格分析：现价合计=sum(现价)，货量=sum(结算重量)，
    # 单公斤价格=现价合计/货量。
    # G1: 现价 100+40=140, 货量 15 -> 140/15
    # G2: 220, 20 -> 11.0
    # G3: 150, 15 -> 10.0
    # G4: 60, 8 -> 7.5
    # G5: 120, 12 -> 10.0
    result = _run("网点单公斤价格分析")
    assert _column(result, "现价合计") == [140, 220, 150, 60, 120]
    assert _column(result, "货量") == [15, 20, 15, 8, 12]

    prices = _column(result, "单公斤价格")
    assert prices[0] == pytest.approx(140 / 15)
    assert prices[1] == pytest.approx(11.0)
    assert prices[2] == pytest.approx(10.0)
    assert prices[3] == pytest.approx(7.5)
    assert prices[4] == pytest.approx(10.0)


def test_fixed_rule_discount():
    # 网点折扣分析：现价合计=sum(现价)，原价合计=sum(原价)，折扣=现价合计/原价合计。
    # G1: 现价 140, 原价 120+50=170 -> 140/170
    # G2: 220, 240 -> 220/240
    # G3: 150, 180 -> 150/180
    # G4: 60, 70 -> 60/70
    # G5: 120, 140 -> 120/140
    result = _run("网点折扣分析")
    assert _column(result, "现价合计") == [140, 220, 150, 60, 120]
    assert _column(result, "原价合计") == [170, 240, 180, 70, 140]

    discounts = _column(result, "折扣")
    assert discounts[0] == pytest.approx(140 / 170)
    assert discounts[1] == pytest.approx(220 / 240)
    assert discounts[2] == pytest.approx(150 / 180)
    assert discounts[3] == pytest.approx(60 / 70)
    assert discounts[4] == pytest.approx(120 / 140)


def test_derived_expression_unknown_metric_raises():
    config = AnalysisConfig(
        dataset_id="x",
        time_range=_TIME_RANGE,
        metrics=[Metric(id="m1", field="结算重量", agg="sum", alias="货量")],
        derived_metrics=[
            DerivedMetric(id="d1", expression="货量 / 不存在", alias="结果")
        ],
    )
    with pytest.raises(AccountingError) as exc:
        execute(config, _df())
    assert exc.value.code == "INVALID_DERIVED_EXPRESSION"
