"""HTTP 端点：导出文件记录（导出文件管理页用）。"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from accounting_backend.config import API_PREFIX
from accounting_backend.schemas.export_record import (
    ExportRecord,
    ExportRecordCreate,
    ExportRecordList,
)
from accounting_backend.services import export_record_service

router = APIRouter(prefix=API_PREFIX)


@router.get("/exports", response_model=ExportRecordList)
def list_exports(
    limit: int = Query(200, ge=1, le=1000),
    query: Optional[str] = None,
) -> ExportRecordList:
    """按导出时间倒序列出导出记录。"""
    items, total = export_record_service.list_export_records(limit=limit, query=query)
    return ExportRecordList(items=items, total=total)


@router.post("/exports", response_model=ExportRecord, status_code=201)
def create_export(request: ExportRecordCreate) -> ExportRecord:
    """登记一次导出（导出成功后由前端调用）。"""
    return export_record_service.add_export_record(request)


@router.delete("/exports/{record_id}")
def delete_export(record_id: str) -> dict:
    """删除一条记录（不删磁盘文件）。"""
    return {"deleted": export_record_service.delete_export_record(record_id)}


@router.delete("/exports")
def clear_exports() -> dict:
    """清空记录（不删磁盘文件）。"""
    return {"deleted": export_record_service.clear_export_records()}
