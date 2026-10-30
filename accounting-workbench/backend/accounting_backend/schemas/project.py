"""Pydantic models for project management."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from accounting_backend.schemas.analysis import AnalysisConfig, ComputeResult
from accounting_backend.schemas.dataset import Dataset, FixedRuleInfo, PreviewPage


class ProjectCreateRequest(BaseModel):
    name: str
    creator: str
    source_path: str


class Project(BaseModel):
    id: str
    name: str
    creator: str
    created_at: str
    updated_at: str
    source_path: Optional[str] = None
    source_type: Optional[str] = None
    row_count: Optional[int] = None
    col_count: Optional[int] = None
    analysis_config: Optional[AnalysisConfig] = None
    has_result: bool = False
    last_opened_at: Optional[str] = None
    saved_kind: str = "manual"
    # 分析 / 一键算 / 盈亏平衡 三个界面的输入快照（只存输入，不存结果）
    state: Optional[dict] = None


class ProjectSummary(BaseModel):
    id: str
    name: str
    creator: str
    created_at: str
    updated_at: str
    row_count: Optional[int] = None
    col_count: Optional[int] = None
    has_result: bool = False
    last_opened_at: Optional[str] = None


class ProjectListResponse(BaseModel):
    items: list[ProjectSummary]
    total: int


class ProjectDetail(BaseModel):
    project: Project
    dataset: Dataset
    result: Optional[ComputeResult] = None
    fixed_rules: list[FixedRuleInfo] = Field(default_factory=list)


class SaveRequest(BaseModel):
    analysis_config: AnalysisConfig
    result: Optional[ComputeResult] = None
    # 三个工具页的输入快照；不传则保留原值
    state: Optional[dict] = None
    # manual = 用户点保存；auto = 没点保存就退出的自动保存
    saved_kind: Optional[str] = None


class MergeRequest(BaseModel):
    project_ids: list[str]
    base_id: Optional[str] = None
    dry_run: bool = False
    name: Optional[str] = None


class MergeResponse(BaseModel):
    project: Optional[Project] = None
    dataset: Optional[Dataset] = None
    preview: PreviewPage
    sources: list[str] = Field(default_factory=list)
    sources_distribution: dict[str, int] = Field(default_factory=dict)
