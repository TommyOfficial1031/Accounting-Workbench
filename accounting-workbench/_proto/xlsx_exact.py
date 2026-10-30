"""Dump exact (untruncated) formulas for the representative cells of each block."""
from __future__ import annotations

from pathlib import Path

from openpyxl import load_workbook

SRC = Path(r"C:\Users\13774\Desktop\网管算账工作台\工作簿1.xlsx")
OUT = Path(__file__).resolve().parent / "xlsx" / "exact.txt"

wb = load_workbook(SRC, data_only=False)
ws = wb["看板"]

targets = [
    "A1", "B1", "D1", "G1", "H1", "J1", "K1", "M1", "N1", "O1", "P1", "Q1", "R1", "S1", "T1", "U1",
    "A2", "B2", "C2", "O2", "U2", "T2", "S2", "R2",
    "C3", "D3", "O3", "U3", "A3", "B3",
    "C4", "D4", "E4", "N4", "O4", "P4", "T4", "U4", "V4", "Z4",
    "D5", "O5", "U5",
    "A36", "B36", "C36", "D36", "O36", "U36",
]

lines: list[str] = []
for coord in targets:
    value = ws[coord].value
    lines.append(f"--- {coord} ---")
    lines.append(str(value))
    lines.append("")

OUT.write_text("\n".join(lines), encoding="utf-8")

# also: distinct province/类区 list in rows 4..36
pairs = [(ws[f"A{r}"].value, ws[f"B{r}"].value) for r in range(4, 37)]
lines2 = ["=== A/B 行标签（4-36） ==="]
for i, (a, b) in enumerate(pairs, start=4):
    lines2.append(f"{i}\t{a}\t{b}")
OUT.with_name("rowlabels.txt").write_text("\n".join(lines2), encoding="utf-8")
print("ok")
