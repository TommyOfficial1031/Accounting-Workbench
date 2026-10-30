"""导出记录编排：补 id / 时间 / 项目归属，然后交给 storage 落库。"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from accounting_backend.schemas.export_record import ExportRecord, ExportRecordCreate
from accounting_backend.storage import export_store


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def add_export_record(request: ExportRecordCreate) -> ExportRecord:
    """登记一条导出记录（同一路径重复导出会重复登记，便于查历史）。"""
    now = _now()
    record = {
        "id": uuid.uuid4().hex,
        "name": request.name,
        "kind": request.kind,
        "path": request.path,
        "project_id": request.project_id,
        "project_name": request.project_name,
        "creator": request.creator,
        "exported_at": now,
        "created_at": now,
    }
    stored = export_store.add_record(record)
    return ExportRecord(**stored)


def list_export_records(limit: int = 200, query: Optional[str] = None) -> tuple[list[ExportRecord], int]:
    """返回记录列表与总数。"""
    rows = export_store.list_records(limit=limit, query=query)
    return [ExportRecord(**row) for row in rows], len(rows)


def delete_export_record(record_id: str) -> bool:
    return export_store.delete_record(record_id)


def clear_export_records() -> int:
    return export_store.clear_records()
