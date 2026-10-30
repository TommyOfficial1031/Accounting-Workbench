"""盈亏平衡与折扣分析的 HTTP 端点。"""

from __future__ import annotations

from pydantic import BaseModel, Field

from fastapi import APIRouter

from accounting_backend.compute.regression import manual_model, table_groups
from accounting_backend.config import API_PREFIX
from accounting_backend.schemas.regression import (
    RegressionManualConfig,
    RegressionManualResult,
    RegressionTableConfig,
    RegressionTableResult,
)
from accounting_backend.services import edit_service

router = APIRouter(prefix=API_PREFIX)


class ManualRequest(BaseModel):
    """手动测算：纯输入，不依赖数据集。"""

    config: RegressionManualConfig


class TableRequest(RegressionTableConfig):
    """表格取数：在配置之外补上数据集 id。"""

    dataset_id: str = Field(description="导入后返回的数据集 id")


@router.post("/regression/manual", response_model=RegressionManualResult)
def manual_endpoint(request: ManualRequest) -> RegressionManualResult:
    """手动测算：两张卡 + 承诺货量扫描表。"""
    return manual_model(request.config)


@router.post("/regression/table", response_model=RegressionTableResult)
def table_endpoint(request: TableRequest) -> RegressionTableResult:
    """表格取数：按勾选组合拆组，算每组调整前后的利润。"""
    df = edit_service.get_frame(request.dataset_id)
    # 坑 2：router 里重建 config 必须把每个字段都透传，漏一个就会出现「前端传了、后端不生效」
    config = RegressionTableConfig(
        time_range=request.time_range,
        dims=request.dims,
        picks=request.picks,
        cascade=request.cascade,
        policies=request.policies,
        exclude=request.exclude,
        source=request.source,
    )
    return table_groups(df, config)
