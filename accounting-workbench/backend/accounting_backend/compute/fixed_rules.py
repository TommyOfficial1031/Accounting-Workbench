"""三条固定规则的执行：从 constants.FIXED_RULES 构建 AnalysisConfig。"""

from __future__ import annotations

from accounting_backend.constants import FIXED_RULES
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import (
    AnalysisConfig,
    DerivedMetric,
    GroupByField,
    Metric,
    TimeRange,
)


def build_analysis_config(
    rule_name: str, dataset_id: str, time_range: TimeRange
) -> AnalysisConfig:
    """根据固定规则名称构建对应的 AnalysisConfig。"""
    rule = FIXED_RULES.get(rule_name)
    if rule is None:
        raise AccountingError("UNKNOWN_RULE", f"未知的固定规则：{rule_name}")

    metrics = [
        Metric(id=f"m{i + 1}", field=m["field"], agg=m["agg"], alias=m["alias"])
        for i, m in enumerate(rule["metrics"])
    ]
    derived_metrics = [
        DerivedMetric(id=f"d{i + 1}", expression=d["expression"], alias=d["alias"])
        for i, d in enumerate(rule.get("derived_metrics", []))
    ]
    group_by = [GroupByField(field=field) for field in rule["group_by"]]

    return AnalysisConfig(
        dataset_id=dataset_id,
        time_range=time_range,
        group_by=group_by,
        metrics=metrics,
        derived_metrics=derived_metrics,
    )
