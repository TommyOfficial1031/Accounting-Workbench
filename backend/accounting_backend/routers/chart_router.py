"""HTTP 端点：渲染图表。"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse

from accounting_backend.chart.builder import render_chart_jpeg, render_chart_pdf
from accounting_backend.config import API_PREFIX
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.chart import ChartRenderRequest

router = APIRouter(prefix=API_PREFIX)


@router.post("/chart/render")
def render_chart_endpoint(request: ChartRenderRequest) -> Response:
    """渲染图表。

    - 不传 ``path``：返回 PDF/JPEG 二进制流（浏览器降级用）。
    - 传 ``path``：写到该路径并返回 ``{"path": ..., "bytes": n}``（桌面端先弹保存框）。
    """
    if request.format not in ("pdf", "jpeg"):
        raise AccountingError("INVALID_EXPORT_FORMAT", f"不支持的导出格式：{request.format}")

    renderer = render_chart_pdf if request.format == "pdf" else render_chart_jpeg
    media_type = "application/pdf" if request.format == "pdf" else "image/jpeg"
    filename = "chart.pdf" if request.format == "pdf" else "chart.jpg"

    try:
        content = renderer(request.result, request.chart, request.render_opts)
    except AccountingError:
        raise
    except Exception as exc:  # noqa: BLE001 - 统一包装渲染异常
        raise AccountingError("CHART_RENDER_FAILED", f"图表渲染失败：{exc}") from exc

    if request.path:
        target = Path(request.path)
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        except OSError as exc:
            raise AccountingError(
                "EXPORT_WRITE_FAILED", f"写入文件失败：{exc}", status_code=400
            ) from exc
        return JSONResponse({"path": str(target), "bytes": len(content)})

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
