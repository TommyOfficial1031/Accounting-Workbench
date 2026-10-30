"""Excel 导出测试（xlsx/xls）。"""

from __future__ import annotations

import pytest
from openpyxl import load_workbook

from accounting_backend.errors import AccountingError
from accounting_backend.io.excel_exporter import (
    compute_column_width,
    export_xls,
    export_xlsx,
)
from accounting_backend.schemas.analysis import ComputeResult


def _result(rows=None, cols=None):
    columns = cols or ["账单时间", "寄件所属一级网点", "货量"]
    if rows is None:
        rows = [
            ["2026-10-01", "网点A", 15.0],
            ["2026-10-02", "网点B", 8.0],
        ]
    return ComputeResult(columns=columns, rows=rows, row_count=len(rows), meta={})


def test_export_xlsx_header_and_values(tmp_path):
    path = tmp_path / "out.xlsx"
    export_xlsx(_result(), str(path))

    wb = load_workbook(path)
    ws = wb.active
    assert ws.max_row == 3  # 表头 + 2 行
    assert ws.max_column == 3
    assert ws["A1"].value == "账单时间"
    assert ws["A1"].font.bold is True  # 表头加粗
    assert ws.freeze_panes == "A2"  # 冻结首行
    assert ws["A2"].value == "2026-10-01"
    assert ws["C3"].value == 8.0
    # 数值单元格带千分位格式（用户 2026-10-29：千以上写成 1,000）
    assert ws["C3"].number_format == "#,##0.####"
    assert ws["A3"].number_format == "General"  # 文本列不动


def test_xlsx_big_number_stays_number_with_grouping(tmp_path):
    path = tmp_path / "big.xlsx"
    export_xlsx(_result(rows=[["2026-10-01", "网点A", 12345.6]]), str(path))

    ws = load_workbook(path).active
    assert ws["C2"].value == 12345.6  # 值本身不变（还是数字）
    assert ws["C2"].number_format == "#,##0.####"  # 显示成 12,345.6


def test_export_xls_header_bold(tmp_path):
    import xlrd

    path = tmp_path / "out.xls"
    export_xls(_result(), str(path))

    book = xlrd.open_workbook(str(path), formatting_info=True)
    sheet = book.sheet_by_index(0)
    assert sheet.nrows == 3
    assert sheet.cell_value(0, 0) == "账单时间"
    xf_index = sheet.cell_xf_index(0, 0)
    font_index = book.xf_list[xf_index].font_index
    assert book.font_list[font_index].bold == 1  # 表头加粗


def test_xls_number_cells_use_thousands_format(tmp_path):
    import xlrd

    path = tmp_path / "big.xls"
    export_xls(_result(rows=[["2026-10-01", "网点A", 12345.6]]), str(path))

    book = xlrd.open_workbook(str(path), formatting_info=True)
    sheet = book.sheet_by_index(0)
    xf = book.xf_list[sheet.cell_xf_index(1, 2)]
    assert book.format_map[xf.format_key].format_str == "#,##0.####"
    assert sheet.cell_value(1, 2) == 12345.6


def test_compute_column_width():
    assert compute_column_width("货量", ["100", "2000"]) == 8  # 下限
    assert compute_column_width("x", ["a" * 100]) == 50  # 上限
    assert compute_column_width("账单时间", []) == 10  # 4 个中文 = 8，+2 = 10
    # 数值按「带千分位」的显示宽度算：1,234,567（9 格）比 1234567（7 格）宽 2 格
    assert compute_column_width("货量", [1234567]) == 11
    assert compute_column_width("货量", ["1234567"]) == 9  # 字符串按原样算


def test_xls_row_limit_exceeded(tmp_path):
    rows = [["2026-10-01", "A", 1.0]] * 65537
    result = _result(rows=rows)
    with pytest.raises(AccountingError) as exc:
        export_xls(result, str(tmp_path / "out.xls"))
    assert exc.value.code == "XLS_ROW_LIMIT_EXCEEDED"


def test_xls_col_limit_exceeded(tmp_path):
    columns = [f"c{i}" for i in range(257)]
    result = _result(cols=columns, rows=[list(range(257))])
    with pytest.raises(AccountingError) as exc:
        export_xls(result, str(tmp_path / "out.xls"))
    assert exc.value.code == "XLS_COL_LIMIT_EXCEEDED"


def test_xlsx_row_limit(tmp_path):
    rows = [["2026-10-01", "A", 1.0]] * 50001
    result = _result(rows=rows)
    with pytest.raises(AccountingError) as exc:
        export_xlsx(result, str(tmp_path / "out.xlsx"))
    assert exc.value.code == "RESULT_TOO_LARGE"
