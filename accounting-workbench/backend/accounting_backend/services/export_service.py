"""导出编排：按 format 分发到对应导出器。"""

from __future__ import annotations

import io
import os
from pathlib import Path

from accounting_backend.errors import AccountingError
from accounting_backend.io.csv_exporter import export_csv
from accounting_backend.io.excel_exporter import export_xls, export_xlsx
from accounting_backend.schemas.analysis import ComputeResult


def export_table(result: ComputeResult, format: str, path: str) -> str:
    """校验路径并写盘，返回路径。"""
    _validate_path(path, format)
    _dispatch(result, format, path)
    return path


def export_bytes(result: ComputeResult, format: str) -> bytes:
    """渲染到内存并返回字节（浏览器降级用）。"""
    buf = io.BytesIO()
    _dispatch(result, format, buf)
    return buf.getvalue()


def _dispatch(result: ComputeResult, format: str, destination) -> None:
    if format == "xlsx":
        export_xlsx(result, destination)
    elif format == "xls":
        export_xls(result, destination)
    elif format == "csv":
        export_csv(result, destination)
    else:
        raise AccountingError("INVALID_EXPORT_FORMAT", f"不支持的导出格式：{format}")


def _validate_path(path: str, format: str) -> None:
    if not path or not path.strip():
        raise AccountingError("INVALID_EXPORT_PATH", "导出路径不能为空")
    p = Path(path)
    parent = p.parent
    if not parent.exists():
        raise AccountingError("INVALID_EXPORT_PATH", f"父目录不存在：{parent}")
    if not os.access(parent, os.W_OK):
        raise AccountingError("INVALID_EXPORT_PATH", f"父目录不可写：{parent}")
    ext = p.suffix.lower().lstrip(".")
    if ext != format:
        raise AccountingError(
            "INVALID_EXPORT_PATH", f"文件扩展名与格式不一致：.{ext} != .{format}"
        )
