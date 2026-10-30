"""计算编排：加载数据集并执行计算引擎。"""

from __future__ import annotations

from accounting_backend.compute.engine import execute
from accounting_backend.schemas.analysis import AnalysisConfig, ComputeResult
from accounting_backend.services import edit_service


def compute(config: AnalysisConfig) -> ComputeResult:
    """加载工作副本（编辑后的数据）并执行计算。"""
    df = edit_service.get_frame(config.dataset_id)
    return execute(config, df)
