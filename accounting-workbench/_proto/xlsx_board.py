"""Render 看板 as a compact grid + 数据原表 header/sample for logic reverse-engineering."""
from __future__ import annotations

from pathlib import Path

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

SRC = Path(r"C:\Users\13774\Desktop\网管算账工作台\工作簿1.xlsx")
OUT = Path(__file__).resolve().parent / "xlsx"

wb = load_workbook(SRC, data_only=False)
board = wb["看板"]
raw = wb["数据原表"]

lines: list[str] = []

# ---- 数据原表 header ----
lines.append("=== 数据原表 表头（第 1 行，46 列） ===")
for col in range(1, raw.max_column + 1):
    name = raw.cell(row=1, column=col).value
    lines.append(f"{get_column_letter(col)}\t{name}")

lines.append("")
lines.append("=== 数据原表 第 2-3 行样例 ===")
for r in (2, 3):
    cells = []
    for col in range(1, raw.max_column + 1):
        v = raw.cell(row=r, column=col).value
        cells.append(f"{get_column_letter(col)}={v!r}")
    lines.append(f"row{r}: " + " | ".join(cells))

# ---- 看板 grid ----
lines.append("")
lines.append("=== 看板 全量网格（公式原样，截断 300 字符） ===")
for r in range(1, board.max_row + 1):
    row_out = []
    for col in range(1, board.max_column + 1):
        v = board.cell(row=r, column=col).value
        if v is None:
            continue
        text = str(v).replace("\n", " ")
        if len(text) > 300:
            text = text[:300] + f"…(+{len(text) - 300})"
        row_out.append(f"{get_column_letter(col)}{r}: {text}")
    if row_out:
        lines.append(f"--- ROW {r} ---")
        lines.extend(row_out)

(OUT / "board.txt").write_text("\n".join(lines), encoding="utf-8")
print("wrote board.txt lines:", len(lines))
