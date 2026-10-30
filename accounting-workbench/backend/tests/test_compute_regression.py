"""盈亏平衡与折扣分析：数值对照测试（与前端原型 regModel() 同口径）。"""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from accounting_backend.compute.regression import manual_model, table_groups
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import TimeRange
from accounting_backend.schemas.regression import (
    GroupPolicy,
    RegressionManualConfig,
    RegressionTableConfig,
)


def _time_range() -> TimeRange:
    return TimeRange(start=date(2026, 10, 1), end=date(2026, 10, 31))


def _frame() -> pd.DataFrame:
    """两个网点 × 两个省份，每个组合 1 行，数字便于手算。"""
    return pd.DataFrame(
        {
            "账单时间": ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"],
            "寄件所属一级网点": ["金东三部", "金东三部", "金华婺城", "金华婺城"],
            "目的所属省份": ["安徽省", "福建省", "安徽省", "福建省"],
            "公斤段": ["0-60", "0-60", "0-60", "0-60"],
            "结算重量": [100.0, 200.0, 400.0, 800.0],
            "现价": [80.0, 180.0, 320.0, 720.0],
            "原价": [100.0, 200.0, 400.0, 800.0],
        }
    )


class TestManualModel:
    def test_two_cards_numbers(self) -> None:
        result = manual_model(
            RegressionManualConfig(
                p0=1.0,
                d=0.8,
                d_plan=0.7,
                b_now=3000,
                b_plan=2000,
                c=0.5,
                z_now=100_000,
                z_plan=120_000,
            )
        )
        assert result.p_now == pytest.approx(0.8)
        assert result.m_now == pytest.approx(0.3)
        assert result.profit_now == pytest.approx(33_000)
        assert result.revenue_now == pytest.approx(83_000)
        assert result.rate_now == pytest.approx(33_000 / 83_000)

        assert result.p_plan == pytest.approx(0.7)
        assert result.m_plan == pytest.approx(0.2)
        assert result.profit_plan == pytest.approx(26_000)
        assert result.revenue_plan == pytest.approx(86_000)
        assert result.rate_plan == pytest.approx(26_000 / 86_000)

    def test_one_percent_and_break_even(self) -> None:
        result = manual_model(
            RegressionManualConfig(
                p0=1.0, d=0.8, d_plan=0.7, b_now=0, b_plan=2000, c=0.5, z_now=1, z_plan=120_000
            )
        )
        assert result.one_pct == pytest.approx(1_200)
        # d* = (C − B/Z) / P0
        assert result.break_even_discount == pytest.approx((0.5 - 2_000 / 120_000) / 1.0)

    def test_steps_scan_volumes(self) -> None:
        result = manual_model(
            RegressionManualConfig(
                p0=1.0, d=0.8, d_plan=0.7, b_now=0, b_plan=2000, c=0.5, z_now=1, z_plan=100_000
            )
        )
        factors = [step.factor for step in result.steps]
        assert factors == [0.5, 1.0, 1.5, 2.0, 3.0]
        half = result.steps[0]
        assert half.z == pytest.approx(50_000)
        assert half.profit == pytest.approx(0.2 * 50_000 + 2_000)
        assert half.rate == pytest.approx((0.2 * 50_000 + 2_000) / (0.7 * 50_000 + 2_000))
        assert half.break_even_discount == pytest.approx(0.5 - 2_000 / 50_000)

    def test_b_covers_loss(self) -> None:
        """m_plan < 0 但杂费兜底后利润为正 → 判定「盈利（B 兜底）」。"""
        result = manual_model(
            RegressionManualConfig(
                p0=1.0, d=0.9, d_plan=0.8, b_now=0, b_plan=20_000, c=0.9, z_now=1, z_plan=100_000
            )
        )
        assert result.m_plan == pytest.approx(-0.1)
        assert result.profit_plan == pytest.approx(10_000)
        assert result.steps[1].judge == "盈利（B 兜底）"

    def test_zero_division_is_none(self) -> None:
        """分母为 0 时不允许出现 inf/NaN。"""
        result = manual_model(
            RegressionManualConfig(
                p0=1.0, d=1.0, d_plan=1.0, b_now=-100, b_plan=-100, c=1.0, z_now=100, z_plan=100
            )
        )
        assert result.rate_plan is None or result.revenue_plan == 0
        assert result.profit_plan == pytest.approx(-100)


class TestTableGroups:
    def test_single_group_when_no_picks(self) -> None:
        config = RegressionTableConfig(time_range=_time_range())
        result = table_groups(_frame(), config)
        assert len(result.groups) == 1
        group = result.groups[0]
        assert group.label == "全部"
        assert group.row_count == 4
        assert group.z == pytest.approx(1_500)
        assert group.p0 == pytest.approx(1_500 / 1_500)
        assert group.p == pytest.approx(1_300 / 1_500)
        assert group.d == pytest.approx(1_300 / 1_500)
        assert result.filled_count == 0
        assert group.filled is False
        assert group.profit_plan is None
        assert "已填 0 / 1 组" in result.advice

    def test_cartesian_groups_and_policy(self) -> None:
        config = RegressionTableConfig(
            time_range=_time_range(),
            picks={"寄件所属一级网点": ["金东三部"], "目的所属省份": ["安徽省", "福建省"]},
        )
        result = table_groups(_frame(), config)
        assert [group.label for group in result.groups] == ["金东三部 · 安徽省", "金东三部 · 福建省"]
        first = result.groups[0]
        assert first.row_count == 1
        assert first.z == pytest.approx(100)
        assert first.p0 == pytest.approx(1.0)
        assert first.p == pytest.approx(0.8)

        # 四个值都填 → 出调整后
        config.policies = {
            "金东三部 · 安徽省": GroupPolicy(c_line=0.2, op_cost=0.05, d_plan=0.6, z_plan=500),
        }
        result = table_groups(_frame(), config)
        filled = result.groups[0]
        assert filled.filled is True
        assert filled.c == pytest.approx(0.25)
        assert filled.p_plan == pytest.approx(0.6)
        assert filled.profit_plan == pytest.approx((0.6 - 0.25) * 500)
        assert result.filled_count == 1
        # 合计只统计已填的组
        assert result.z_plan == pytest.approx(500)
        assert result.profit_plan == pytest.approx((0.6 - 0.25) * 500)
        assert result.one_pct == pytest.approx(first.p0 * 500 / 100)

    def test_empty_combos_are_counted(self) -> None:
        config = RegressionTableConfig(
            time_range=_time_range(),
            picks={"目的所属省份": ["安徽省", "不存在的省"]},
        )
        result = table_groups(_frame(), config)
        assert result.empty_combos == 1
        assert len(result.groups) == 1

    def test_time_range_filters_rows(self) -> None:
        config = RegressionTableConfig(
            time_range=TimeRange(start=date(2026, 10, 9), end=date(2026, 10, 31))
        )
        result = table_groups(_frame(), config)
        assert result.groups[0].row_count == 3

    def test_missing_fields_raise(self) -> None:
        frame = _frame().drop(columns=["原价"])
        with pytest.raises(AccountingError) as exc:
            table_groups(frame, RegressionTableConfig(time_range=_time_range()))
        assert exc.value.code == "MISSING_FIELDS"

    def test_no_data_raises(self) -> None:
        config = RegressionTableConfig(
            time_range=TimeRange(start=date(2020, 1, 1), end=date(2020, 1, 2))
        )
        with pytest.raises(AccountingError) as exc:
            table_groups(_frame(), config)
        assert exc.value.code == "NO_DATA"

    def test_rates_and_judgement(self) -> None:
        config = RegressionTableConfig(time_range=_time_range())
        config.policies = {
            "全部": GroupPolicy(c_line=0.5, op_cost=0.5, d_plan=0.9, z_plan=1_000),
        }
        result = table_groups(_frame(), config)
        group = result.groups[0]
        # P0 = 1.0, P = 0.8666…, C = 1.0 → 调整前亏损
        assert group.profit_now < 0
        # 计划折扣 0.9 → P_plan = 0.9, C = 1.0 → 每公斤 −0.1，货量 1000 → −100
        assert group.profit_plan == pytest.approx(-100)
        assert result.rate_plan == pytest.approx(-100 / 900)


CASCADE_DIMS = ["寄件所属一级网点", "目的所属省份", "公斤段"]


def _cascade_frame() -> pd.DataFrame:
    """两个网点 × 两个省份 × 公斤段：安徽省两段、浙江省也两段（用户 2026-10-29 的例子）。"""
    return pd.DataFrame(
        {
            "账单时间": [
                "2026-10-08",
                "2026-10-09",
                "2026-10-10",
                "2026-10-11",
                "2026-10-12",
                "2026-10-13",
                "2026-10-14",
            ],
            "寄件所属一级网点": [
                "上饶德兴",
                "上饶德兴",
                "上饶德兴",
                "东阳一部",
                "东阳一部",
                "东阳一部",
                "东阳一部",
            ],
            "目的所属省份": [
                "安徽省",
                "安徽省",
                "浙江省",
                "安徽省",
                "安徽省",
                "浙江省",
                "浙江省",
            ],
            "公斤段": ["0-60", "60-150", "0-60", "0-60", "60-150", "0-60", "60-150"],
            "结算重量": [100.0, 200.0, 400.0, 800.0, 1_000.0, 1_600.0, 3_200.0],
            "现价": [80.0, 180.0, 320.0, 720.0, 900.0, 1_440.0, 3_200.0],
            "原价": [100.0, 200.0, 400.0, 800.0, 1_000.0, 1_600.0, 3_200.0],
        }
    )


class TestCascadeCombos:
    """第 11 轮 A①：cascade（省份 → 该省公斤段）展开组合。"""

    def test_province_with_its_own_bands(self) -> None:
        """浙江省只要 0-60：不能被别的省份的 60-150 带出来（数据里有那一段也不出卡片）。"""
        config = RegressionTableConfig(
            time_range=_time_range(),
            dims=CASCADE_DIMS,
            picks={
                "寄件所属一级网点": ["上饶德兴", "东阳一部"],
                "目的所属省份": ["安徽省", "浙江省"],
            },
            cascade={"目的所属省份": {"安徽省": ["0-60", "60-150"], "浙江省": ["0-60"]}},
        )
        result = table_groups(_cascade_frame(), config)
        # 顺序 = 省份 → 网点 → 该省公斤段（与用户给的例子逐条一致）
        assert [group.label for group in result.groups] == [
            "上饶德兴 · 安徽省 · 0-60",
            "上饶德兴 · 安徽省 · 60-150",
            "东阳一部 · 安徽省 · 0-60",
            "东阳一部 · 安徽省 · 60-150",
            "上饶德兴 · 浙江省 · 0-60",
            "东阳一部 · 浙江省 · 0-60",
        ]
        assert result.empty_combos == 0
        first = result.groups[0]
        assert first.z == pytest.approx(100)
        assert first.p0 == pytest.approx(1.0)
        assert first.p == pytest.approx(0.8)
        # 结构化 parts 供「按省份统一写成本」分组用
        assert first.parts == {
            "寄件所属一级网点": "上饶德兴",
            "目的所属省份": "安徽省",
            "公斤段": "0-60",
        }
        # 4100 = 安徽省 (100+200+800+1000) + 浙江省 (400+1600)；浙江的 60-150 没勾
        assert sum(group.z for group in result.groups) == pytest.approx(4_100)

    def test_band_without_data_is_hidden(self) -> None:
        """某个省勾了数据里没有的公斤段 → 该组合记入 empty_combos，不出卡片。"""
        config = RegressionTableConfig(
            time_range=_time_range(),
            dims=CASCADE_DIMS,
            picks={
                "寄件所属一级网点": ["上饶德兴", "东阳一部"],
                "目的所属省份": ["安徽省"],
            },
            cascade={"目的所属省份": {"安徽省": ["0-60", "60-150", "800+"]}},
        )
        result = table_groups(_cascade_frame(), config)
        assert [group.label for group in result.groups] == [
            "上饶德兴 · 安徽省 · 0-60",
            "上饶德兴 · 安徽省 · 60-150",
            "东阳一部 · 安徽省 · 0-60",
            "东阳一部 · 安徽省 · 60-150",
        ]
        # 两个网点 × 「800+」都没数据
        assert result.empty_combos == 2

    def test_old_picks_without_cascade_still_cartesian(self) -> None:
        """没有 cascade 的老请求仍是笛卡尔积（项目快照里的 picks 不能坏）。"""
        config = RegressionTableConfig(
            time_range=_time_range(),
            dims=CASCADE_DIMS,
            picks={
                "寄件所属一级网点": ["上饶德兴"],
                "目的所属省份": ["安徽省", "浙江省"],
                "公斤段": ["0-60", "60-150"],
            },
        )
        result = table_groups(_cascade_frame(), config)
        labels = [group.label for group in result.groups]
        # 笛卡尔积：2 省 × 2 段 = 4 个组合，其中 2 个没有数据
        assert len(labels) + result.empty_combos == 4
        assert labels == [
            "上饶德兴 · 安徽省 · 0-60",
            "上饶德兴 · 安徽省 · 60-150",
            "上饶德兴 · 浙江省 · 0-60",
        ]
        assert result.groups[0].parts["公斤段"] == "0-60"
