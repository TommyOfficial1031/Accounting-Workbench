"""Probe 工作簿1.xlsx structure: sheets, dimensions, formulas, validations.

Writes UTF-8 text dumps into _proto/xlsx/ so the harness can read them without
console codepage issues.
"""
from __future__ import annotations

import json
from pathlib import Path

from openpyxl import load_workbook

SRC = Path(r"C:\Users\13774\Desktop\网管算账工作台\工作簿1.xlsx")
OUT = Path(__file__).resolve().parent / "xlsx"
OUT.mkdir(parents=True, exist_ok=True)

wb = load_workbook(SRC, data_only=False)

lines: list[str] = []
lines.append(f"file={SRC.name} size={SRC.stat().st_size}")
lines.append(f"sheets={wb.sheetnames}")
lines.append(f"defined_names={list(wb.defined_names)}")

for ws in wb.worksheets:
    lines.append("")
    lines.append(f"=== sheet '{ws.title}' dims={ws.dimensions} max_row={ws.max_row} max_col={ws.max_column} ===")
    lines.append(f"merged={[str(r) for r in ws.merged_cells.ranges][:20]}")
    lines.append(f"tables={list(ws.tables)} state={ws.sheet_state}")
    try:
        dvs = ws.data_validations.dataValidation
        for dv in dvs:
            lines.append(
                f"VALIDATION type={dv.type} sqref={dv.sqref} formula1={dv.formula1!r} "
                f"formula2={dv.formula2!r} allow_blank={dv.allow_blank}"
            )
        if not dvs:
            lines.append("VALIDATION none")
    except Exception as exc:  # noqa: BLE001
        lines.append(f"VALIDATION error {exc}")
    cf = list(ws.conditional_formatting)
    lines.append(f"conditional_formatting_ranges={[str(r.sqref) for r in cf]}")

# Full formula inventory per sheet
formula_lines: list[str] = []
for ws in wb.worksheets:
    formula_lines.append("")
    formula_lines.append(f"=== FORMULAS sheet '{ws.title}' ===")
    count = 0
    for row in ws.iter_rows():
        for cell in row:
            value = cell.value
            if isinstance(value, str) and value.startswith("="):
                formula_lines.append(f"{cell.coordinate}\t{value}")
                count += 1
    formula_lines.append(f"-- formula_count={count}")
    if count == 0:
        # no formulas: dump first rows raw so we can see the layout
        formula_lines.append("-- first 12 rows raw:")
        for row in ws.iter_rows(min_row=1, max_row=min(12, ws.max_row)):
            cells = [f"{c.coordinate}={c.value!r}" for c in row if c.value is not None]
            if cells:
                formula_lines.append("   " + " | ".join(cells))

(OUT / "overview.txt").write_text("\n".join(lines), encoding="utf-8")
(OUT / "formulas.txt").write_text("\n".join(formula_lines), encoding="utf-8")

# cached values
wb2 = load_workbook(SRC, data_only=True)
value_lines: list[str] = []
for ws in wb2.worksheets:
    value_lines.append("")
    value_lines.append(f"=== VALUES sheet '{ws.title}' (first 15 rows) ===")
    for row in ws.iter_rows(min_row=1, max_row=min(15, ws.max_row)):
        cells = [f"{c.coordinate}={c.value!r}" for c in row if c.value is not None]
        if cells:
            value_lines.append(" | ".join(cells))
(OUT / "values.txt").write_text("\n".join(value_lines), encoding="utf-8")

print(json.dumps({"sheets": wb.sheetnames, "out": str(OUT)}, ensure_ascii=False))
