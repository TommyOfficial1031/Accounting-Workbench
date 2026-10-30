"""Orchestration for project CRUD, save, and merge."""

from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import pandas as pd

from accounting_backend.data.merger import merge_dataframes, sources_by_row
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import ComputeResult
from accounting_backend.schemas.dataset import ColumnMeta, Dataset, ImportRequest, PreviewPage
from accounting_backend.schemas.project import (
    MergeRequest,
    MergeResponse,
    Project,
    ProjectCreateRequest,
    ProjectDetail,
    ProjectListResponse,
    ProjectSummary,
    SaveRequest,
)
from accounting_backend.services import import_service
from accounting_backend.storage import project_store
from accounting_backend.storage.dataset_cache import cache_dataframe
from accounting_backend.storage.paths import (
    get_dataset_path,
    get_project_dir,
    get_project_parquet_path,
    get_project_result_path,
)

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _source_type(path: str) -> str | None:
    return Path(path).suffix.lower().lstrip(".") or None


def _to_summary(record: dict) -> ProjectSummary:
    return ProjectSummary(
        id=record["id"],
        name=record["name"],
        creator=record["creator"],
        created_at=record["created_at"],
        updated_at=record["updated_at"],
        row_count=record.get("row_count"),
        col_count=record.get("col_count"),
        has_result=record.get("has_result", False),
        last_opened_at=record.get("last_opened_at"),
    )


def _infer_dtype(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "bool"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date"
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    return "string"


def _build_dataset(
    project_id: str,
    name: str,
    source_path: str | None,
    df: pd.DataFrame,
    created_at: str,
) -> Dataset:
    columns = [
        ColumnMeta(name=str(col), dtype=_infer_dtype(df[col]))
        for col in df.columns
    ]
    dataset = Dataset(
        id=project_id,
        name=name,
        source_path=source_path or "",
        sheet_name=None,
        columns=columns,
        row_count=len(df),
        col_count=len(df.columns),
        created_at=created_at,
    )
    return import_service.enrich_dataset(dataset)


def _load_result(project_id: str) -> ComputeResult | None:
    path = get_project_result_path(project_id)
    if not path.exists():
        return None
    return ComputeResult(**json.loads(path.read_text(encoding="utf-8")))


def create_project(request: ProjectCreateRequest) -> ProjectDetail:
    """Import a file and persist it as a new project."""
    response = import_service.import_dataset(ImportRequest(path=request.source_path))
    project_id = response.dataset.id

    get_project_dir(project_id).mkdir(parents=True, exist_ok=True)
    shutil.copy(get_dataset_path(project_id), get_project_parquet_path(project_id))

    now = _now()
    record = {
        "id": project_id,
        "name": request.name,
        "creator": request.creator,
        "created_at": now,
        "updated_at": now,
        "source_path": request.source_path,
        "source_type": _source_type(request.source_path),
        "row_count": response.dataset.row_count,
        "col_count": response.dataset.col_count,
        "analysis_config": None,
        "has_result": False,
        "last_opened_at": now,
    }
    project_store.create_project(record)
    return ProjectDetail(
        project=Project(**record),
        dataset=response.dataset,
        result=None,
        fixed_rules=response.fixed_rules,
    )


def _normalize_end_date(created_to: str | None) -> str | None:
    if created_to and len(created_to) == 10:  # YYYY-MM-DD → 当天 23:59:59
        return created_to + " 23:59:59"
    return created_to


def query_projects(
    name: str | None = None,
    creator: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    order_by: str = "last_opened_at",
    offset: int = 0,
    limit: int | None = None,
) -> ProjectListResponse:
    """Return filtered + paginated projects for the history window / manager."""
    end = _normalize_end_date(created_to)
    records = project_store.query_projects(
        name=name,
        creator=creator,
        created_from=created_from,
        created_to=end,
        order_by=order_by,
        offset=offset,
        limit=limit,
    )
    total = project_store.count_projects(
        name=name,
        creator=creator,
        created_from=created_from,
        created_to=end,
    )
    return ProjectListResponse(items=[_to_summary(r) for r in records], total=total)


def get_project(project_id: str) -> ProjectDetail:
    """Load a project's data, analysis config, and cached result."""
    record = project_store.get_project(project_id)
    if record is None:
        raise AccountingError("PROJECT_NOT_FOUND", f"项目不存在：{project_id}", status_code=404)

    parquet = get_project_parquet_path(project_id)
    if not parquet.exists():
        raise AccountingError(
            "PROJECT_CACHE_MISSING",
            f"项目缓存文件丢失：{parquet}",
            details={"source_path": record.get("source_path")},
            status_code=404,
        )

    df = pd.read_parquet(parquet)
    cache_dataframe(project_id, df)
    project_store.touch_opened(project_id, _now())
    record = project_store.get_project(project_id)
    dataset = _build_dataset(
        project_id, record["name"], record.get("source_path"), df, record["created_at"]
    )
    result = _load_result(project_id) if record.get("has_result") else None
    column_names = [column.name for column in dataset.columns]
    return ProjectDetail(
        project=Project(**record),
        dataset=dataset,
        result=result,
        fixed_rules=import_service.build_fixed_rules(column_names),
    )


def delete_project(project_id: str) -> None:
    """Delete a project's record, then best-effort remove its cache directory."""
    if project_store.get_project(project_id) is None:
        raise AccountingError("PROJECT_NOT_FOUND", f"项目不存在：{project_id}", status_code=404)

    project_store.delete_project(project_id)
    try:
        shutil.rmtree(get_project_dir(project_id))
    except OSError as exc:
        logger.warning("failed to remove project cache dir %s: %s", project_id, exc)


def save_project(project_id: str, request: SaveRequest) -> Project:
    """Update analysis_config and result cache without re-importing."""
    if project_store.get_project(project_id) is None:
        raise AccountingError("PROJECT_NOT_FOUND", f"项目不存在：{project_id}", status_code=404)

    has_result = request.result is not None
    if request.result is not None:
        result_path = get_project_result_path(project_id)
        result_path.parent.mkdir(parents=True, exist_ok=True)
        result_path.write_text(request.result.model_dump_json(), encoding="utf-8")

    updated = project_store.save_project(
        project_id,
        request.analysis_config.model_dump(mode="json"),
        has_result,
        _now(),
        state=request.state,
        saved_kind=request.saved_kind,
    )
    return Project(**updated)


def _resolve_base_index(
    project_ids: list[str],
    base_id: str | None,
    dfs: list[pd.DataFrame],
    records: list[dict],
) -> int:
    if base_id is not None:
        if base_id not in project_ids:
            raise AccountingError("INVALID_BASE_PROJECT", f"基准项目不在所选列表中：{base_id}")
        return project_ids.index(base_id)

    max_fields = max(len(df.columns) for df in dfs)
    candidates = [i for i, df in enumerate(dfs) if len(df.columns) == max_fields]
    if len(candidates) == 1:
        return candidates[0]
    return min(candidates, key=lambda i: records[i]["created_at"])


def merge_projects(request: MergeRequest) -> MergeResponse:
    """Merge multiple projects' data with field alignment and row ordering."""
    if len(request.project_ids) < 2:
        raise AccountingError("MERGE_NEEDS_TWO_PROJECTS", "至少选择两个项目进行合并")

    dfs: list[pd.DataFrame] = []
    names: list[str] = []
    records: list[dict] = []
    for project_id in request.project_ids:
        record = project_store.get_project(project_id)
        if record is None:
            raise AccountingError("PROJECT_NOT_FOUND", f"项目不存在：{project_id}", status_code=404)
        parquet = get_project_parquet_path(project_id)
        if not parquet.exists():
            raise AccountingError(
                "PROJECT_CACHE_MISSING",
                f"项目缓存文件丢失：{parquet}",
                details={"source_path": record.get("source_path")},
                status_code=404,
            )
        dfs.append(pd.read_parquet(parquet))
        names.append(record["name"])
        records.append(record)

    base_index = _resolve_base_index(request.project_ids, request.base_id, dfs, records)
    merged_df = merge_dataframes(dfs, base_index)
    sources = sources_by_row(dfs, names)
    distribution = {name: sources.count(name) for name in names}
    preview = PreviewPage(
        columns=[str(c) for c in merged_df.columns],
        rows=import_service.rows_to_jsonable(merged_df.head(10)),
        offset=0,
        total_rows=len(merged_df),
    )

    if request.dry_run:
        return MergeResponse(
            project=None,
            dataset=None,
            preview=preview,
            sources=sources,
            sources_distribution=distribution,
        )

    project_id = str(uuid4())
    get_project_dir(project_id).mkdir(parents=True, exist_ok=True)
    merged_df.to_parquet(get_project_parquet_path(project_id), index=False)
    cache_dataframe(project_id, merged_df)

    now = _now()
    name = request.name or "合并项目"
    creators = list(dict.fromkeys(record["creator"] for record in records if record.get("creator")))
    record = {
        "id": project_id,
        "name": name,
        "creator": "、".join(creators),
        "created_at": now,
        "updated_at": now,
        "source_path": None,
        "source_type": None,
        "row_count": len(merged_df),
        "col_count": len(merged_df.columns),
        "analysis_config": None,
        "has_result": False,
        "last_opened_at": now,
    }
    project_store.create_project(record)
    dataset = _build_dataset(project_id, name, None, merged_df, now)
    return MergeResponse(
        project=Project(**record),
        dataset=dataset,
        preview=preview,
        sources=sources,
        sources_distribution=distribution,
    )
