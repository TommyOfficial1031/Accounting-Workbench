"""Pydantic models for analysis configuration and compute results."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class TimeRange(BaseModel):
    start: date
    end: date
    field: str = "账单时间"


class FilterCondition(BaseModel):
    field: str
    op: Literal[
        "eq",
        "ne",
        "gt",
        "ge",
        "lt",
        "le",
        "in",
        "not_in",
        "contains",
        "notContains",
        "startsWith",
        "endsWith",
        "between",
        "aboveAvg",
        "belowAvg",
    ]
    value: Any


class FilterGroup(BaseModel):
    logic: Literal["AND", "OR"] = "AND"
    conditions: list[FilterCondition] = Field(default_factory=list)


class GroupByField(BaseModel):
    field: str
    time_granularity: Optional[Literal["day"]] = None


class Metric(BaseModel):
    id: str
    field: str
    agg: Literal["sum", "avg", "max", "min", "median", "count"]
    alias: str


class DerivedMetric(BaseModel):
    id: str
    expression: str
    alias: str


class AnalysisConfig(BaseModel):
    dataset_id: str
    time_range: TimeRange
    filters: FilterGroup = Field(default_factory=FilterGroup)
    group_by: list[GroupByField] = Field(default_factory=list)
    metrics: list[Metric] = Field(default_factory=list)
    derived_metrics: list[DerivedMetric] = Field(default_factory=list)


class ComputeResult(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    meta: dict = Field(default_factory=dict)
