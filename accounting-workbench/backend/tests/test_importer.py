"""P1 文件导入 + 缓存的回归测试，覆盖 xlsx / xls / csv 三种格式。"""

from __future__ import annotations

import csv

import pytest

from accounting_backend.io.importer import import_file
from accounting_backend.storage.dataset_cache import cache_dataframe, load_dataframe

HEADER = ["账单时间", "寄件网点", "现价", "结算重量"]


def _sample_rows():
    return [
        HEADER,
        ["2026-10-01", "网点A", 1.5, 10.0],
        ["2026-10-02", "网点B", 2.5, 20.0],
        ["2026-10-03", "网点C", 3.5, 30.0],
    ]


def _write_csv(path, rows, encoding="utf-8"):
    with open(path, "w", encoding=encoding, newline="") as fh:
        writer = csv.writer(fh)
        for row in rows:
            writer.writerow(row)


def _write_xlsx(path, sheets):
    """sheets 形如 [(sheet_name, rows), ...]，第一个 Sheet 为主表。"""
    import openpyxl

    workbook = openpyxl.Workbook()
    for index, (name, rows) in enumerate(sheets):
        ws = workbook.active if index == 0 else workbook.create_sheet()
        ws.title = name
        for row in rows:
            ws.append(row)
    workbook.save(path)


def _write_xls(path, rows):
    import xlwt

    book = xlwt.Workbook()
    sheet = book.add_sheet("Sheet1")
    for r, row in enumerate(rows):
        for c, value in enumerate(row):
            sheet.write(r, c, value)
    book.save(path)


def test_import_csv_infers_types(tmp_path):
    path = tmp_path / "sample.csv"
    _write_csv(path, _sample_rows(), encoding="utf-8")

    result = import_file(str(path), encoding="utf-8")
    assert not result.errors, result.errors
    assert result.dataset.row_count == 3
    assert result.dataset.col_count == 4
    assert [c.name for c in result.dataset.columns] == HEADER

    dtypes = {c.name: c.dtype for c in result.dataset.columns}
    assert dtypes["账单时间"] == "date"
    assert dtypes["寄件网点"] == "string"
    assert dtypes["现价"] == "number"
    assert dtypes["结算重量"] == "number"


def test_import_xlsx_multi_sheet_warning(tmp_path):
    path = tmp_path / "sample.xlsx"
    _write_xlsx(path, [("第一页", _sample_rows()), ("第二页", [["X"], [1]])])

    result = import_file(str(path))
    assert not result.errors, result.errors
    assert result.dataset.sheet_name == "第一页"
    assert result.dataset.row_count == 3
    assert any("个 Sheet" in w for w in result.warnings), result.warnings


def test_import_xls(tmp_path):
    path = tmp_path / "sample.xls"
    _write_xls(path, _sample_rows())

    result = import_file(str(path))
    assert not result.errors, result.errors
    assert result.dataset.row_count == 3
    assert result.dataset.col_count == 4
    assert [c.name for c in result.dataset.columns] == HEADER


def test_import_wide_table_not_truncated(tmp_path):
    """列数不设上限：超过旧上限 200 列的文件按实际列数完整导入。"""
    path = tmp_path / "wide.csv"
    header = [f"字段{i}" for i in range(1, 251)]
    _write_csv(path, [header, [i for i in range(1, 251)]], encoding="utf-8")

    result = import_file(str(path), encoding="utf-8")
    assert not result.errors, result.errors
    assert result.dataset.col_count == 250
    assert len(result.dataframe.columns) == 250
    assert list(result.dataframe.columns) == header
    assert result.warnings == []


def test_import_over_100k_rows_and_cache(tmp_path, monkeypatch):
    # 将缓存目录重定向到临时目录，避免污染用户主目录。
    monkeypatch.setattr(
        "accounting_backend.storage.paths.get_data_dir",
        lambda: tmp_path,
    )

    row_total = 100_500
    path = tmp_path / "big.csv"
    rows = [HEADER] + [
        ["2026-10-01", "网点%d" % (i % 100), i * 0.5, i * 1.1] for i in range(row_total)
    ]
    _write_csv(path, rows, encoding="utf-8")

    result = import_file(str(path), encoding="utf-8")
    assert not result.errors, result.errors
    # 行数不设上限：超过旧上限 100,000 行也不截断。
    assert result.dataset.row_count == row_total
    assert len(result.dataframe) == row_total
    assert result.dataset.col_count == 4
    assert result.warnings == []

    cached = cache_dataframe(result.dataset.id, result.dataframe)
    assert cached.endswith(".parquet")

    loaded = load_dataframe(result.dataset.id)
    assert len(loaded) == row_total
    assert list(loaded.columns) == HEADER
    assert loaded.iloc[row_total - 1]["寄件网点"] == "网点99"
    assert loaded.iloc[row_total - 1]["现价"] == pytest.approx((row_total - 1) * 0.5)
