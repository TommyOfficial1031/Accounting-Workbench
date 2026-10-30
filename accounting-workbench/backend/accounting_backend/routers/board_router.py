"""看板（一键算）的 HTTP 端点。"""

from __future__ import annotations

from pydantic import BaseModel, Field

from fastapi import APIRouter

from accounting_backend.compute.board import board_dim_sources, build_board
from accounting_backend.config import API_PREFIX
from accounting_backend.schemas.board import BoardConfig, BoardDimSources, BoardResult
from accounting_backend.services import edit_service

router = APIRouter(prefix=API_PREFIX)


class BoardRequest(BoardConfig):
    """在配置之外补上数据集 id。"""

    dataset_id: str = Field(description="导入后返回的数据集 id")


class BoardSourcesRequest(BaseModel):
    """候选值请求：只要数据集、网点勾选与口径，不需要整份配置。"""

    dataset_id: str
    nets: list[str] = Field(default_factory=list)
    exclude: str = "不剔除"
    source: str = "普通物品"


@router.post("/board", response_model=BoardResult)
def board_endpoint(request: BoardRequest) -> BoardResult:
    """按筛选条件汇总 6 个公斤段的量/价/折扣。"""
    df = edit_service.get_frame(request.dataset_id)
    config = BoardConfig(
        time_range=request.time_range,
        nets=request.nets,
        exclude=request.exclude,
        source=request.source,
        dims=request.dims,
        dim_values=request.dim_values,
    )
    return build_board(df, config)


@router.post("/board/sources", response_model=BoardDimSources)
def board_sources_endpoint(request: BoardSourcesRequest) -> BoardDimSources:
    """维度候选值：网点来自数据，省份只保留已选网点覆盖到的。"""
    from datetime import date

    from accounting_backend.schemas.analysis import TimeRange
    from accounting_backend.schemas.board import BoardConfig as _BoardConfig

    df = edit_service.get_frame(request.dataset_id)
    config = _BoardConfig(
        time_range=TimeRange(start=date(1970, 1, 1), end=date(2999, 12, 31)),
        nets=request.nets,
        exclude=request.exclude,
        source=request.source,
    )
    return board_dim_sources(df, config)
