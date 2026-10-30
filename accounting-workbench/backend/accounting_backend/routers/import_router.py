"""HTTP endpoints for file import and dataset preview.

Routers only parse requests and return responses; business logic lives in
``services/import_service.py``.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from accounting_backend.config import API_PREFIX
from accounting_backend.schemas.dataset import (
    ImportRequest,
    ImportResponse,
    PreviewPage,
    TimeRangeInfo,
)
from accounting_backend.schemas.edit import EditRequest, EditResponse
from accounting_backend.services import edit_service, import_service

router = APIRouter(prefix=API_PREFIX)


@router.post("/import", response_model=ImportResponse)
def import_file_endpoint(request: ImportRequest) -> ImportResponse:
    """Import a local file and return its metadata plus the first preview page."""
    return import_service.import_dataset(request)


@router.get("/dataset/{dataset_id}/time-range", response_model=TimeRangeInfo)
def time_range_endpoint(dataset_id: str) -> TimeRangeInfo:
    """Return the dataset's auto-detected time field and its min~max date (第 11 轮 C)."""
    return import_service.get_time_range(dataset_id)


@router.get("/dataset/{dataset_id}/preview", response_model=PreviewPage)
def preview_endpoint(
    dataset_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=2000),
) -> PreviewPage:
    """Return one paged preview slice for an imported dataset."""
    return import_service.get_preview(dataset_id, offset, limit)


@router.patch("/dataset/{dataset_id}", response_model=EditResponse)
def edit_endpoint(dataset_id: str, request: EditRequest) -> EditResponse:
    """Apply an edit command (cell / paste / cut / row / col / undo / redo / reset)."""
    return edit_service.apply(request, dataset_id)
