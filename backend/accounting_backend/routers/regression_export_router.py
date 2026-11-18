"""盈亏平衡导出接口：把四类文件写进一个文件夹。"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from fastapi import APIRouter

from accounting_backend.config import API_PREFIX
from accounting_backend.errors import AccountingError
from accounting_backend.io.regression_exporter import (
    export_manual_folder,
    export_regression_folder,
)
from accounting_backend.schemas.regression import (
    RegressionManualConfig,
    RegressionManualResult,
    RegressionTableResult,
)
from accounting_backend.services import edit_service

router = APIRouter(prefix=API_PREFIX)


class ExportResponse(BaseModel):
    """导出结果：文件夹路径 + 文件清单。"""

    folder: str
    files: list[str]


class TableExportRequest(BaseModel):
    """表格取数模式的导出：把已经算好的结果 + 目标目录传进来。"""

    result: RegressionTableResult
    out_dir: str = Field(description="用户选择的父目录")
    stamp: str = Field(description="时间戳，形如 2026-10-23 17：30")
    prefix: str = Field("", description="文件夹名前缀（已勾选的取值）")


class ManualExportRequest(BaseModel):
    """手动测算模式的导出。"""

    config: RegressionManualConfig
    out_dir: str
    stamp: str
    prefix: str = "手动测算"


@router.post("/regression/export/table", response_model=ExportResponse)
def export_table_endpoint(request: TableExportRequest) -> ExportResponse:
    """导出「整页 PDF + 网格 JPEG + 单图 JPEG + 汇算明细 XLSX」到一个文件夹。"""
    try:
        payload = export_regression_folder(
            groups=request.result.groups,
            out_dir=Path(request.out_dir),
            stamp=request.stamp,
            prefix=request.prefix,
            advice=request.result.advice,
            totals={
                "profit_now": request.result.profit_now,
                "profit_plan": request.result.profit_plan,
                "rate_now": request.result.rate_now,
                "rate_plan": request.result.rate_plan,
                "z": request.result.z,
                "z_plan": request.result.z_plan,
                "filled_count": request.result.filled_count,
            },
        )
    except AccountingError:
        raise
    except Exception as exc:  # noqa: BLE001 - 统一包装导出异常
        raise AccountingError("EXPORT_FAILED", f"导出失败：{exc}") from exc
    return ExportResponse(**payload)


@router.post("/regression/export/manual", response_model=ExportResponse)
def export_manual_endpoint(request: ManualExportRequest) -> ExportResponse:
    """手动测算的导出（同样四类文件，单图只有一张）。"""
    from accounting_backend.compute.regression import manual_model

    result: RegressionManualResult = manual_model(request.config)
    try:
        payload = export_manual_folder(
            result=result,
            out_dir=Path(request.out_dir),
            stamp=request.stamp,
            prefix=request.prefix,
        )
    except AccountingError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise AccountingError("EXPORT_FAILED", f"导出失败：{exc}") from exc
    return ExportResponse(**payload)
