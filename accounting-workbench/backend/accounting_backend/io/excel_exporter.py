"""Excel 导出（xlsx=openpyxl，xls=xlwt）。"""

from __future__ import annotations

from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import ComputeResult

MAX_XLSX_ROWS = 50_000
MAX_XLS_ROWS = 65_536
MAX_XLS_COLS = 256
_HEADER_FILL = "F5F5F7"
#: 数值单元格格式：千以上带千分位（用户 2026-10-29 定稿：10,000 而不是 1.0万）
NUMBER_FORMAT = "#,##0.####"


def export_xlsx(result: ComputeResult, destination) -> None:
    """导出 xlsx（destination 可为路径或文件对象）。"""
    if result.row_count > MAX_XLSX_ROWS:
        raise AccountingError(
            "RESULT_TOO_LARGE", f"结果超过 {MAX_XLSX_ROWS} 行，请改用 CSV 导出"
        )

    wb = Workbook()
    ws = wb.active
    ws.title = "结果"
    ws.freeze_panes = "A2"  # 冻结首行

    header_font = Font(bold=True)
    header_fill = PatternFill("solid", fgColor=_HEADER_FILL)

    ws.append(list(result.columns))
    for col_idx in range(1, len(result.columns) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill

    for row in result.rows:
        ws.append([_clean_value(v) for v in row])
        # 数值列套千分位显示（值本身不变，只是 Excel 里显示成 10,000）
        for cell in ws[ws.max_row]:
            if _is_number(cell.value):
                cell.number_format = NUMBER_FORMAT

    # 列宽自适应：扫描表头 + 前 1000 行
    for col_idx, column in enumerate(result.columns):
        sample = [result.rows[r][col_idx] for r in range(min(result.row_count, 1000))]
        ws.column_dimensions[get_column_letter(col_idx + 1)].width = compute_column_width(
            column, sample
        )

    wb.save(destination)


def export_xls(result: ComputeResult, destination) -> None:
    """导出 xls（destination 可为路径或文件对象）。"""
    if result.row_count > MAX_XLS_ROWS:
        raise AccountingError(
            "XLS_ROW_LIMIT_EXCEEDED", f"xls 最多 {MAX_XLS_ROWS} 行（实际 {result.row_count} 行）"
        )
    if len(result.columns) > MAX_XLS_COLS:
        raise AccountingError(
            "XLS_COL_LIMIT_EXCEEDED",
            f"xls 最多 {MAX_XLS_COLS} 列（实际 {len(result.columns)} 列）",
        )

    import xlwt

    wb = xlwt.Workbook()
    ws = wb.add_sheet("结果")
    header_style = xlwt.easyxf("font: bold on; pattern: pattern solid, fore_colour gray25;")
    number_style = xlwt.easyxf(num_format_str=NUMBER_FORMAT)

    for c, column in enumerate(result.columns):
        ws.write(0, c, column, header_style)

    for r, row in enumerate(result.rows, start=1):
        for c, value in enumerate(row):
            cleaned = _clean_value(value)
            if _is_number(cleaned):
                ws.write(r, c, cleaned, number_style)
            else:
                ws.write(r, c, cleaned)

    ws.set_panes_frozen(True)
    ws.set_horz_split_pos(1)
    ws.set_vert_split_pos(0)

    wb.save(destination)


def compute_column_width(header: str, values: list) -> int:
    """计算列宽：表头 + 样本值，中文按 2 倍宽度，上下限 8~50。"""
    max_width = _text_width(header)
    for value in values:
        max_width = max(max_width, _text_width(_display_text(value)))
    return max(8, min(50, max_width + 2))


def _display_text(value: Any) -> str:
    """与单元格显示一致：数值带千分位，宽度才够放下「10,000」。"""
    if value is None:
        return ""
    if _is_number(value):
        return f"{value:,}"
    return str(value)


def _is_number(value: Any) -> bool:
    """真数值（bool 是 int 的子类，要排掉）。"""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _text_width(text: str) -> int:
    return sum(2 if ord(ch) > 127 else 1 for ch in text)


def _clean_value(value: Any) -> Any:
    return "" if value is None else value
