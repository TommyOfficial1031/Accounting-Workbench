"""Format-specific readers that turn xlsx / xls / csv files into a Dataset.

``io/`` only performs format conversion and never touches ``compute/``. This
module reads the file, cleans the header, infers column dtypes and returns an
``ImportResult`` carrying the ``Dataset`` metadata, the full DataFrame and any
warnings/errors.
"""

from __future__ import annotations

import uuid
import warnings
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

import pandas as pd

from accounting_backend.schemas.dataset import ColumnMeta, Dataset


@dataclass
class ImportResult:
    """Outcome of importing a single file."""

    dataset: Dataset
    dataframe: pd.DataFrame
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


@dataclass
class _ReadResult:
    """Internal reader output before header normalization."""

    dataframe: pd.DataFrame
    sheet_name: Optional[str] = None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def import_file(path: str, encoding: Optional[str] = None) -> ImportResult:
    """Read an xlsx / xls / csv file and build the corresponding Dataset."""
    source = Path(path)
    if not source.exists():
        return _error_result(source.name, str(source), f"文件不存在：{path}")

    suffix = source.suffix.lower()
    if suffix in {".xlsx", ".xlsm"}:
        read = _read_excel(source)
    elif suffix == ".xls":
        read = _read_xls(source)
    elif suffix == ".csv":
        read = _read_csv(source, encoding)
    else:
        return _error_result(source.name, str(source), f"不支持的文件类型：{suffix}")

    if read.errors:
        return _error_result(source.name, str(source), "; ".join(read.errors))

    # 行列数不设上限：文件有多少行列就导入多少，不做截断。
    df = _normalize_columns(read.dataframe)
    warnings = list(read.warnings)

    if len(df.columns) == 0:
        return _error_result(source.name, str(source), "文件没有可用的表头")

    dataset = Dataset(
        id=uuid.uuid4().hex,
        name=source.name,
        source_path=str(source),
        sheet_name=read.sheet_name,
        columns=_infer_columns(df),
        row_count=len(df),
        col_count=len(df.columns),
        created_at=datetime.now().isoformat(timespec="seconds"),
    )
    return ImportResult(dataset=dataset, dataframe=df, warnings=warnings)


def _read_excel(path: Path) -> _ReadResult:
    import openpyxl

    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        sheet_names = workbook.sheetnames
        warnings: list[str] = []
        if len(sheet_names) > 1:
            warnings.append(
                f"文件包含 {len(sheet_names)} 个 Sheet，仅读取第一个 Sheet（{sheet_names[0]}）"
            )
        if not sheet_names:
            return _ReadResult(dataframe=pd.DataFrame(), warnings=warnings)

        sheet = workbook[sheet_names[0]]
        df = _build_dataframe(sheet.values)
        return _ReadResult(dataframe=df, sheet_name=sheet_names[0], warnings=warnings)
    finally:
        workbook.close()


def _read_xls(path: Path) -> _ReadResult:
    import xlrd

    book = xlrd.open_workbook(str(path))
    sheet_names = book.sheet_names()
    warnings: list[str] = []
    if len(sheet_names) > 1:
        warnings.append(
            f"文件包含 {len(sheet_names)} 个 Sheet，仅读取第一个 Sheet（{sheet_names[0]}）"
        )
    if not sheet_names:
        return _ReadResult(dataframe=pd.DataFrame(), warnings=warnings)

    sheet = book.sheet_by_index(0)
    if sheet.nrows > 65536:
        return _ReadResult(
            dataframe=pd.DataFrame(),
            errors=[f"xls 文件超过 65536 行上限（实际 {sheet.nrows} 行）"],
        )

    raw_rows = (sheet.row_values(i) for i in range(sheet.nrows))
    df = _build_dataframe(raw_rows)
    return _ReadResult(dataframe=df, sheet_name=sheet_names[0], warnings=warnings)


def _read_csv(path: Path, encoding: Optional[str]) -> _ReadResult:
    import chardet

    if encoding:
        encodings = [encoding]
    else:
        detected: Optional[str] = None
        with open(path, "rb") as fh:
            raw = fh.read(65536)
        probe = chardet.detect(raw)
        if probe and probe.get("encoding"):
            detected = probe["encoding"]
        encodings = []
        if detected:
            encodings.append(detected)
        for fallback in ("utf-8", "gbk", "gb18030"):
            if fallback not in encodings:
                encodings.append(fallback)

    used_encoding: Optional[str] = None
    last_error: Optional[Exception] = None
    for enc in encodings:
        try:
            df = pd.read_csv(path, encoding=enc)
            used_encoding = enc
            break
        except Exception as exc:  # noqa: BLE001 - try the next fallback encoding
            last_error = exc

    if used_encoding is None:
        return _ReadResult(
            dataframe=pd.DataFrame(),
            errors=[f"CSV 解析失败，已尝试编码 {encodings}：{last_error}"],
        )

    warnings: list[str] = []
    if encoding is None:
        warnings.append(f"CSV 编码自动识别为 {used_encoding}")
    return _ReadResult(dataframe=df, warnings=warnings)


def _build_dataframe(raw_rows: Iterable) -> pd.DataFrame:
    """Build a DataFrame from row values; the first row is the header."""
    first = next(raw_rows, None)
    if first is None:
        return pd.DataFrame()

    header = ["" if v is None else str(v).strip() for v in first]
    width = len(header)

    def padded() -> Iterable:
        for row in raw_rows:
            values = list(row)
            if len(values) < width:
                values.extend([None] * (width - len(values)))
            yield values[:width]

    return pd.DataFrame(padded(), columns=header)


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Clean header names: strip, fill empty, dedupe duplicates."""
    df = df.copy()
    names: list[str] = []
    seen: dict[str, int] = {}
    for i, col in enumerate(df.columns):
        name = "" if pd.isna(col) else str(col).strip()
        if name == "":
            name = f"列{i + 1}"
        count = seen.get(name, 0)
        seen[name] = count + 1
        if count > 0:
            name = f"{name}_{count + 1}"
        names.append(name)
    df.columns = names
    return df


def _infer_columns(df: pd.DataFrame) -> list[ColumnMeta]:
    return [ColumnMeta(name=name, dtype=_infer_dtype(df[name])) for name in df.columns]


def _infer_dtype(series: pd.Series) -> str:
    non_null = series.dropna()
    if non_null.empty:
        return "string"
    if pd.api.types.is_bool_dtype(non_null):
        return "bool"
    if pd.api.types.is_numeric_dtype(non_null):
        return "number"
    if pd.api.types.is_datetime64_any_dtype(non_null):
        return "date"
    if _looks_like_date(non_null):
        return "date"
    return "string"


def _looks_like_date(series: pd.Series) -> bool:
    sample = series.head(20)
    if sample.empty:
        return False
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            parsed = pd.to_datetime(sample, errors="coerce")
    except (TypeError, ValueError):
        return False
    return bool(parsed.notna().all() and len(parsed) > 0)


def _error_result(name: str, source_path: str, message: str) -> ImportResult:
    dataset = Dataset(
        id=uuid.uuid4().hex,
        name=name,
        source_path=source_path,
        columns=[],
        row_count=0,
        col_count=0,
        created_at=datetime.now().isoformat(timespec="seconds"),
    )
    return ImportResult(dataset=dataset, dataframe=pd.DataFrame(), errors=[message])
