"""Orchestration for file import and dataset preview paging."""

from __future__ import annotations

import logging
import math
import time

import pandas as pd

from accounting_backend.data.field_registry import FieldRegistry
from accounting_backend.compute.time_dimension import detect_time_range
from accounting_backend.errors import AccountingError
from accounting_backend.io.importer import ImportResult, import_file
from accounting_backend.schemas.dataset import (
    Dataset,
    FixedRuleInfo,
    ImportRequest,
    ImportResponse,
    PreviewPage,
    TimeRangeInfo,
)
from accounting_backend.services import edit_service
from accounting_backend.storage.dataset_cache import cache_dataframe

PREVIEW_PAGE_SIZE = 500
_registry = FieldRegistry()
logger = logging.getLogger(__name__)


def import_dataset(request: ImportRequest) -> ImportResponse:
    """Import a file, cache it as parquet, and return metadata + first page."""
    try:
        t0 = time.perf_counter()
        result = import_file(request.path, request.encoding)
        t1 = time.perf_counter()
        if result.errors:
            raise AccountingError("IMPORT_FAILED", "; ".join(result.errors))

        _enrich_fields(result)
        t2 = time.perf_counter()

        cache_dataframe(result.dataset.id, result.dataframe)
        t3 = time.perf_counter()
        edit_service.register_dataframe(result.dataset.id, result.dataframe)

        logger.info(
            "导入耗时：读取 %.2fs / 字段识别 %.2fs / parquet 写入 %.2fs / 总计 %.2fs",
            t1 - t0,
            t2 - t1,
            t3 - t2,
            t3 - t0,
        )

        preview = _build_preview(result.dataframe, 0, PREVIEW_PAGE_SIZE)
        return ImportResponse(
            dataset=result.dataset,
            preview=preview,
            warnings=result.warnings,
            fixed_rules=_registry.list_fixed_rules(
                [column.name for column in result.dataset.columns]
            ),
        )
    except AccountingError:
        raise
    except Exception as exc:  # noqa: BLE001 - 统一包装为 IMPORT_FAILED，避免裸 500
        logger.exception("导入失败：%s", request.path)
        raise AccountingError("IMPORT_FAILED", str(exc), status_code=400) from exc


def enrich_dataset(dataset: Dataset) -> Dataset:
    """回填每列的预定义标记与五类分类，并计算命中统计。"""
    column_names = [column.name for column in dataset.columns]
    predefined = set(_registry.detect_predefined(column_names))
    for column in dataset.columns:
        column.category = _registry.categorize(column.name)
        column.is_predefined = column.name in predefined
    dataset.predefined_hit_count = len(predefined)
    dataset.fixed_rules_available = _registry.is_fixed_rules_enabled(column_names)
    return dataset


def build_fixed_rules(column_names: list[str]) -> list[FixedRuleInfo]:
    """Return fixed-rule availability info for the given column names."""
    return _registry.list_fixed_rules(column_names)


def _enrich_fields(result: ImportResult) -> None:
    """回填每列的预定义标记与五类分类，并计算命中统计。"""
    enrich_dataset(result.dataset)


def get_preview(dataset_id: str, offset: int, limit: int) -> PreviewPage:
    """Return one page of preview rows for an already-imported dataset."""
    try:
        df = _get_frame(dataset_id)
    except FileNotFoundError as exc:
        raise AccountingError(
            "DATASET_NOT_FOUND",
            f"数据集不存在：{dataset_id}",
            status_code=404,
        ) from exc

    return _build_preview(df, offset, limit)


def get_time_range(dataset_id: str) -> TimeRangeInfo:
    """识别数据集的时间字段并返回它的 min~max 日期（第 11 轮 C）。

    没有时间列 / 整列为空都返回全 ``None`` 的 ``TimeRangeInfo``（前端据此不预填）；
    数据集不存在才报 404（与 ``/preview`` 一致）。
    """
    try:
        df = _get_frame(dataset_id)
    except FileNotFoundError as exc:
        raise AccountingError(
            "DATASET_NOT_FOUND",
            f"数据集不存在：{dataset_id}",
            status_code=404,
        ) from exc
    return detect_time_range(df)


def _build_preview(df: pd.DataFrame, offset: int, limit: int) -> PreviewPage:
    total = len(df)
    offset = max(0, min(offset, total))
    limit = max(1, min(limit, PREVIEW_PAGE_SIZE))
    end = min(offset + limit, total)
    return PreviewPage(
        columns=[str(c) for c in df.columns],
        rows=rows_to_jsonable(df.iloc[offset:end]),
        offset=offset,
        total_rows=total,
    )


def rows_to_jsonable(df_slice: pd.DataFrame) -> list[list[object]]:
    """Convert a DataFrame slice into JSON-safe rows (shared by preview & merge)."""
    return _rows_to_jsonable(df_slice)


def _get_frame(dataset_id: str) -> pd.DataFrame:
    return edit_service.get_frame(dataset_id)


def _rows_to_jsonable(df_slice: pd.DataFrame) -> list[list[object]]:
    rows: list[list[object]] = []
    for record in df_slice.itertuples(index=False, name=None):
        rows.append([_to_json_value(value) for value in record])
    return rows


def _to_json_value(value: object) -> object:
    """Convert a single DataFrame cell into a JSON-safe Python value."""
    try:
        if value is None:
            return None
        if isinstance(value, pd.Timestamp):
            return value.isoformat()
        if isinstance(value, pd.Timedelta):
            return str(value)
        if isinstance(value, float):
            return None if (math.isnan(value) or math.isinf(value)) else value
        if hasattr(value, "item"):
            item = value.item()
            if isinstance(item, float) and (math.isnan(item) or math.isinf(item)):
                return None
            return item
        return value
    except Exception:  # noqa: BLE001 - never fail the preview on a single cell
        return None
