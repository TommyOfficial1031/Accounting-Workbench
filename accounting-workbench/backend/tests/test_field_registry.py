"""P2 字段识别与固定规则可用性的回归测试。"""

from __future__ import annotations

import pytest

from accounting_backend.constants import PREDEFINED_FIELDS
from accounting_backend.data.field_registry import FieldRegistry


@pytest.fixture()
def registry():
    return FieldRegistry()


def test_detect_predefined_only_returns_hits(registry):
    columns = ["账单时间", "寄件所属一级网点", "随便一个字段"]
    assert registry.detect_predefined(columns) == ["账单时间", "寄件所属一级网点"]


def test_categorize(registry):
    assert registry.categorize("账单时间") == "运单基本信息"
    assert registry.categorize("寄件所属一级网点") == "寄件网点信息"
    assert registry.categorize("目的所属省份") == "到件网点信息"
    assert registry.categorize("转运费") == "中转费用"
    assert registry.categorize("燃油费") == "中转费用杂项"
    assert registry.categorize("未知字段") is None


def test_threshold_nine_not_enabled_ten_enabled(registry):
    nine = PREDEFINED_FIELDS[:9]
    assert len(nine) == 9
    assert registry.is_fixed_rules_enabled(nine) is False

    ten = PREDEFINED_FIELDS[:10]
    assert len(ten) == 10
    assert registry.is_fixed_rules_enabled(ten) is True


def test_missing_fields_exact_match(registry):
    columns = ["账单时间", "寄件所属一级网点", "结算重量"]

    assert registry.get_missing_fields("网点货量分析", columns) == [
        "目的所属省份",
        "公斤段",
        "物品来源",
        "是否剔除",
    ]
    assert "现价" in registry.get_missing_fields("网点单公斤价格分析", columns)

    full = [
        "账单时间", "寄件所属一级网点", "目的所属省份", "公斤段",
        "物品来源", "是否剔除", "结算重量",
    ]
    assert registry.get_missing_fields("网点货量分析", full) == []
    assert registry.is_rule_available("网点货量分析", full) is True


def test_list_fixed_rules_shape(registry):
    full = [
        "账单时间", "寄件所属一级网点", "目的所属省份", "公斤段",
        "物品来源", "是否剔除", "结算重量", "现价", "原价",
        "产品类型", "订单来源",
    ]
    rules = registry.list_fixed_rules(full)
    assert [r.name for r in rules] == [
        "网点货量分析",
        "网点单公斤价格分析",
        "网点折扣分析",
    ]
    assert all(r.available for r in rules)
    assert all(r.missing_fields == [] for r in rules)

    cargo = rules[0]
    assert cargo.group_by == [
        "账单时间", "寄件所属一级网点", "目的所属省份",
        "公斤段", "物品来源", "是否剔除",
    ]
    assert cargo.metrics[0].alias == "货量"
    assert cargo.metrics[0].agg == "sum"
