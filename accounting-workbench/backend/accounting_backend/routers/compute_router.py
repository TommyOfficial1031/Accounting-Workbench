"""HTTP 端点：执行分析计算。"""

from __future__ import annotations

from fastapi import APIRouter

from accounting_backend.config import API_PREFIX
from accounting_backend.schemas.analysis import AnalysisConfig, ComputeResult
from accounting_backend.services import compute_service

router = APIRouter(prefix=API_PREFIX)


@router.post("/compute", response_model=ComputeResult)
def compute_endpoint(config: AnalysisConfig) -> ComputeResult:
    """执行分析计算并返回结构化结果。"""
    return compute_service.compute(config)
