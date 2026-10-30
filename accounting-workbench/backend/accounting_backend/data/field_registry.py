"""预定义字段识别、五类分类与固定规则可用性检测。

纯逻辑模块：不访问文件系统或网络，也不依赖 ``compute``。所有检测函数接收
列名列表并返回结构化结果。
"""

from __future__ import annotations

from typing import Optional

from accounting_backend.constants import (
    FIELD_CATEGORIES,
    FIXED_RULES,
    FIXED_RULE_THRESHOLD,
    PREDEFINED_FIELDS,
)
from accounting_backend.schemas.dataset import (
    FixedRuleInfo,
    RuleDerivedMetric,
    RuleMetric,
)


class FieldRegistry:
    """维护预定义字段、五类分类与固定规则，并提供检测函数。"""

    def detect_predefined(self, columns: list[str]) -> list[str]:
        """返回 columns 中命中的预定义字段（保持预定义顺序）。"""
        return [field for field in PREDEFINED_FIELDS if field in columns]

    def categorize(self, field: str) -> Optional[str]:
        """返回字段所属的五类之一，未命中返回 None。"""
        for category, fields in FIELD_CATEGORIES.items():
            if field in fields:
                return category
        return None

    def get_missing_fields(self, rule_name: str, columns: list[str]) -> list[str]:
        """返回执行固定规则所缺少的字段名列表。"""
        rule = FIXED_RULES.get(rule_name)
        if rule is None:
            raise KeyError(f"未知的固定规则：{rule_name}")
        return [field for field in rule["required_fields"] if field not in columns]

    def is_rule_available(self, rule_name: str, columns: list[str]) -> bool:
        """判断固定规则所需字段是否全部存在。"""
        return not self.get_missing_fields(rule_name, columns)

    def is_fixed_rules_enabled(self, columns: list[str]) -> bool:
        """命中预定义字段数是否达到启用固定规则的阈值。"""
        return len(self.detect_predefined(columns)) >= FIXED_RULE_THRESHOLD

    def list_fixed_rules(self, columns: list[str]) -> list[FixedRuleInfo]:
        """返回每条固定规则的可用性、缺失字段与指标预览。"""
        result: list[FixedRuleInfo] = []
        for rule_name, rule in FIXED_RULES.items():
            missing = self.get_missing_fields(rule_name, columns)
            result.append(
                FixedRuleInfo(
                    name=rule_name,
                    available=not missing,
                    missing_fields=missing,
                    group_by=list(rule.get("group_by", [])),
                    metrics=[RuleMetric(**m) for m in rule.get("metrics", [])],
                    derived_metrics=[
                        RuleDerivedMetric(**d) for d in rule.get("derived_metrics", [])
                    ],
                )
            )
        return result
