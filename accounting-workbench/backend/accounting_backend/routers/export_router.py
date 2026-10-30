"""HTTP 端点：导出表格。"""

from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Response

from accounting_backend.config import API_PREFIX
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.export import ExportRequest
from accounting_backend.services import export_service

router = APIRouter(prefix=API_PREFIX)

_MEDIA_TYPES = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "csv": "text/csv",
}


@router.post("/export")
def export_endpoint(request: ExportRequest):
    """导出表格：有 path 写盘返回 JSON；无 path 返回字节流（浏览器降级）。"""
    try:
        if request.path is not None:
            path = export_service.export_table(request.result, request.format, request.path)
            return {"success": True, "path": path}

        content = export_service.export_bytes(request.result, request.format)
        filename = request.filename or f"result.{request.format}"
        return Response(
            content=content,
            media_type=_MEDIA_TYPES[request.format],
            headers={"Content-Disposition": f"attachment; filename={quote(filename)}"},
        )
    except AccountingError:
        raise
    except Exception as exc:  # noqa: BLE001 - 统一包装导出异常
        raise AccountingError("EXPORT_FAILED", f"导出失败：{exc}") from exc
