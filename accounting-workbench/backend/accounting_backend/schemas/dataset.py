"""Pydantic models for datasets, import, and preview."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ColumnMeta(BaseModel):
    name: str
    dtype: Literal["number", "string", "date", "bool"]
    category: Optional[str] = None
    is_predefined: bool = False


class Dataset(BaseModel):
    id: str
    name: str
    source_path: str
    sheet_name: Optional[str] = None
    columns: list[ColumnMeta]
    row_count: int
    col_count: int
    created_at: str
    predefined_hit_count: int = 0
    fixed_rules_available: bool = False


class PreviewPage(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    offset: int
    total_rows: int


class TimeRangeInfo(BaseModel):
    """数据集自动识别出的时间范围（第 11 轮 C：所有时间选择处默认「自定义」并预填）。

    * ``field`` = 识别到的时间字段（优先「账单时间」，否则第一个日期列）；
    * ``start`` / ``end`` = 该字段解析出来的最小 / 最大日期（``YYYY-MM-DD``）；
    * ``rows`` = 解析成功的行数（``0`` 表示整列都没有有效日期）。

    没有时间列 / 整列为空时三个值全是 ``None``（前端据此「自定义」但不预填）。
    """

    field: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    rows: int = 0


class RuleMetric(BaseModel):
    field: str
    agg: str
    alias: str


class RuleDerivedMetric(BaseModel):
    expression: str
    alias: str


class FixedRuleInfo(BaseModel):
    name: str
    available: bool
    missing_fields: list[str] = Field(default_factory=list)
    group_by: list[str] = Field(default_factory=list)
    metrics: list[RuleMetric] = Field(default_factory=list)
    derived_metrics: list[RuleDerivedMetric] = Field(default_factory=list)


class ImportRequest(BaseModel):
    path: str
    encoding: Optional[str] = None


class ImportResponse(BaseModel):
    dataset: Dataset
    preview: PreviewPage
    warnings: list[str] = Field(default_factory=list)
    fixed_rules: list[FixedRuleInfo] = Field(default_factory=list)
