"""一键算「网点对比图表」的文件夹导出接口（1 张合并大图 + N 张拆分小图）。

对应前端 ``src/api/board.ts::exportBoardChartFolder``；只做参数解析与响应包装，
写盘逻辑在 ``io/board_exporter.py``（``backend/AGENTS.md``：routers/ 不写业务）。
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from fastapi import APIRouter

from accounting_backend.config import API_PREFIX
from accounting_backend.errors import AccountingError
from accounting_backend.io.board_exporter import ChartJob, export_board_chart_folder
from accounting_backend.schemas.analysis import ComputeResult
from accounting_backend.schemas.chart import ChartConfig, RenderOpts

router = APIRouter(prefix=API_PREFIX)


class BoardChartJob(BaseModel):
    """一次导出里的一张图（结果表 + 图表配置 + 可选渲染参数）。"""

    result: ComputeResult
    chart: ChartConfig
    render_opts: Optional[RenderOpts] = None


class BoardChartFolderRequest(BaseModel):
    """整批导出：合并大图 + N 张拆分小图。"""

    merged: BoardChartJob
    splits: list[BoardChartJob] = Field(
        default_factory=list, description="每个分组行一张，顺序与 file_names[1:] 对齐"
    )
    out_dir: str = Field(description="用户选择的父目录")
    stamp: str = Field(description="时间戳，形如 2026-10-29 11：38（全角冒号）")
    folder_base: str = Field(description="文件名主体 = 合并大图名（不含时间戳与扩展名）")
    file_names: list[str] = Field(
        default_factory=list,
        description="合并大图 + N 张小图的文件名（不含扩展名，顺序与 splits 对齐）",
    )
    format: str = Field("jpeg", description="pdf | jpeg（其它值由 io 层报 INVALID_EXPORT_FORMAT）")
    render_opts: RenderOpts = Field(
        default_factory=RenderOpts, description="单张图没带 render_opts 时的兜底参数"
    )


class ExportResponse(BaseModel):
    """导出结果：文件夹路径 + 文件清单（文件名）。"""

    folder: str
    files: list[str]


def _to_job(payload: BoardChartJob, fallback: RenderOpts) -> ChartJob:
    """把请求体里的图转成 io 层的数据类（缺渲染参数时用整批的兜底值）。"""
    return ChartJob(
        result=payload.result,
        chart=payload.chart,
        render_opts=payload.render_opts or fallback,
    )


@router.post("/board/export/chart-folder", response_model=ExportResponse)
def export_chart_folder_endpoint(request: BoardChartFolderRequest) -> ExportResponse:
    """把「1 张合并大图 + N 张拆分小图」写进一个文件夹并返回清单。"""
    try:
        payload = export_board_chart_folder(
            merged=_to_job(request.merged, request.render_opts),
            splits=[_to_job(job, request.render_opts) for job in request.splits],
            out_dir=Path(request.out_dir),
            stamp=request.stamp,
            folder_base=request.folder_base,
            file_names=request.file_names,
            fmt=request.format,
        )
    except AccountingError:
        raise
    except Exception as exc:  # noqa: BLE001 - 统一包装导出异常
        raise AccountingError("EXPORT_FAILED", f"导出失败：{exc}") from exc
    return ExportResponse(**payload)
