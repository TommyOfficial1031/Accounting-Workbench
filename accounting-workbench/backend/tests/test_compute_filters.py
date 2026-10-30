"""筛选条件执行测试：全部 op + AND/OR 组合 + 平均值口径。"""

from __future__ import annotations

import pandas as pd
import pytest

from accounting_backend.compute.filters import apply_filters
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import FilterCondition, FilterGroup


def _df():
    return pd.DataFrame(
        {
            "网点": ["A", "B", "A", "C"],
            "重量": [10, 20, 30, 40],
            "备注": ["苹果", "香蕉", "苹果汁", "橙"],
        }
    )


def test_eq_and_ne():
    df = _df()
    eq = FilterGroup(conditions=[FilterCondition(field="网点", op="eq", value="A")])
    assert list(apply_filters(df, eq)["网点"]) == ["A", "A"]

    ne = FilterGroup(conditions=[FilterCondition(field="网点", op="ne", value="A")])
    assert list(apply_filters(df, ne)["网点"]) == ["B", "C"]


def test_comparison_ops():
    df = _df()
    cases = [
        ("gt", [40]),
        ("ge", [30, 40]),
        ("lt", [10, 20]),
        ("le", [10, 20, 30]),
    ]
    for op, expected in cases:
        group = FilterGroup(
            conditions=[FilterCondition(field="重量", op=op, value=30)]
        )
        assert sorted(apply_filters(df, group)["重量"].tolist()) == expected, op


def test_in_and_not_in():
    df = _df()
    in_group = FilterGroup(
        conditions=[FilterCondition(field="网点", op="in", value=["A", "C"])]
    )
    assert sorted(apply_filters(df, in_group)["网点"].tolist()) == ["A", "A", "C"]

    not_in = FilterGroup(
        conditions=[FilterCondition(field="网点", op="not_in", value=["A", "C"])]
    )
    assert list(apply_filters(df, not_in)["网点"]) == ["B"]


def test_contains():
    df = _df()
    group = FilterGroup(
        conditions=[FilterCondition(field="备注", op="contains", value="苹果")]
    )
    assert sorted(apply_filters(df, group)["备注"].tolist()) == ["苹果", "苹果汁"]


def test_and_or_logic():
    df = _df()
    and_group = FilterGroup(
        logic="AND",
        conditions=[
            FilterCondition(field="网点", op="eq", value="A"),
            FilterCondition(field="重量", op="ge", value=30),
        ],
    )
    assert list(apply_filters(df, and_group)["重量"]) == [30]

    or_group = FilterGroup(
        logic="OR",
        conditions=[
            FilterCondition(field="网点", op="eq", value="B"),
            FilterCondition(field="重量", op="eq", value=40),
        ],
    )
    assert sorted(apply_filters(df, or_group)["重量"].tolist()) == [20, 40]


def test_text_prefix_suffix_ops():
    df = _df()
    cases = [
        ("startsWith", "苹果", ["苹果", "苹果汁"]),
        ("endsWith", "汁", ["苹果汁"]),
        ("notContains", "苹果", ["橙", "香蕉"]),
    ]
    for op, value, expected in cases:
        group = FilterGroup(conditions=[FilterCondition(field="备注", op=op, value=value)])
        assert sorted(apply_filters(df, group)["备注"].tolist()) == expected, op


def test_contains_is_literal_not_regex():
    df = _df()
    group = FilterGroup(
        conditions=[FilterCondition(field="备注", op="contains", value="苹果.")]
    )
    assert apply_filters(df, group).empty


def test_between():
    df = _df()
    group = FilterGroup(
        conditions=[FilterCondition(field="重量", op="between", value=[20, 30])]
    )
    assert sorted(apply_filters(df, group)["重量"].tolist()) == [20, 30]

    reversed_bounds = FilterGroup(
        conditions=[FilterCondition(field="重量", op="between", value=[30, 20])]
    )
    assert sorted(apply_filters(df, reversed_bounds)["重量"].tolist()) == [20, 30]


def test_between_requires_two_numbers():
    df = _df()
    group = FilterGroup(
        conditions=[FilterCondition(field="重量", op="between", value=30)]
    )
    with pytest.raises(AccountingError) as excinfo:
        apply_filters(df, group)
    assert excinfo.value.code == "INVALID_VALUE"


def test_above_below_average_uses_pool_after_other_conditions():
    df = _df()
    # 先按网点 != C 过滤（10/20/30），再取高于平均值（20）→ 只有 30
    group = FilterGroup(
        conditions=[
            FilterCondition(field="网点", op="ne", value="C"),
            FilterCondition(field="重量", op="aboveAvg", value=None),
        ]
    )
    assert list(apply_filters(df, group)["重量"]) == [30]

    below = FilterGroup(
        conditions=[FilterCondition(field="重量", op="belowAvg", value=None)]
    )
    assert sorted(apply_filters(df, below)["重量"].tolist()) == [10, 20]


def test_above_average_without_numbers_matches_nothing():
    df = pd.DataFrame({"网点": ["A", "B"], "重量": ["x", "y"]})
    group = FilterGroup(
        conditions=[FilterCondition(field="重量", op="aboveAvg", value=None)]
    )
    assert apply_filters(df, group).empty
