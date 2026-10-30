"""Verify data reality against the board's assumptions: field values, coverage, div-by-zero risk."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

SRC = Path(r"C:\Users\13774\Desktop\网管算账工作台\工作簿1.xlsx")
OUT = Path(__file__).resolve().parent / "xlsx" / "stats.txt"

df = pd.read_excel(SRC, sheet_name="数据原表", engine="openpyxl")
lines: list[str] = []
lines.append(f"shape={df.shape}")
lines.append(f"columns={list(df.columns)}")

def uniq(col: str, limit: int = 40) -> None:
    if col not in df.columns:
        lines.append(f"[{col}] MISSING COLUMN")
        return
    vc = df[col].value_counts(dropna=False)
    lines.append(f"[{col}] distinct={len(vc)}")
    for value, count in vc.head(limit).items():
        lines.append(f"    {value!r}: {count}")

for col in ["类区", "公斤段", "是否剔除", "物品来源", "寄件所属一级网点", "目的所属省份", "账单中心"]:
    uniq(col)

# .1 是否剔除 两列对比
lines.append("")
lines.append("=== 是否剔除 E vs AT ===")
lines.append(f"E non-null={df['是否剔除'].notna().sum()} AT non-null={df.iloc[:, 45].notna().sum()}")
lines.append(f"E values={sorted(map(str, df['是否剔除'].dropna().unique()))[:10]}")
lines.append(f"AT head={df.iloc[:5, 45].tolist()}")

# numeric sanity
lines.append("")
lines.append("=== 数值列 ===")
for col in ["现价", "原价", "结算重量", "实际重量"]:
    s = pd.to_numeric(df[col], errors="coerce")
    lines.append(f"{col}: null={s.isna().sum()} zero={(s == 0).sum()} min={s.min()} max={s.max()} sum={s.sum():.2f}")

# div by zero risk: 原价 sum == 0 while 现价 sum > 0
p = pd.to_numeric(df["现价"], errors="coerce")
o = pd.to_numeric(df["原价"], errors="coerce")
w = pd.to_numeric(df["结算重量"], errors="coerce")
grp = df.assign(现价=p, 原价=o, 结算重量=w).groupby(["寄件所属一级网点", "目的所属省份", "公斤段"], dropna=False).agg(
    现价合计=("现价", "sum"), 原价合计=("原价", "sum"), 重量合计=("结算重量", "sum")
)
lines.append("")
lines.append("=== 除零风险（省份×公斤段组合） ===")
lines.append(f"组合数={len(grp)}")
lines.append(f"原价合计=0 且 现价合计>0 的组合数={(grp['原价合计'].eq(0) & grp['现价合计'].gt(0)).sum()}")
lines.append(f"重量合计=0 且 现价合计>0 的组合数={(grp['重量合计'].eq(0) & grp['现价合计'].gt(0)).sum()}")

# 网点范围 vs 看板下拉
lines.append("")
lines.append("=== 看板下拉值是否存在于数据 ===")
for val in ["丽水缙云", "义乌稠江", "诸暨宏程"]:
    hit = (df["寄件所属一级网点"] == val).sum()
    lines.append(f"寄件所属一级网点 = {val}: {hit}")
    hit2 = (df["寄件网点"] == val).sum() if "寄件网点" in df.columns else -1
    lines.append(f"寄件网点 = {val}: {hit2}")

# 省份覆盖
lines.append("")
lines.append(f"目的所属省份 distinct={df['目的所属省份'].nunique()}  看板行数(4-36)=33")
board_provinces = [
    "浙江省","安徽省",
]
lines.append(f"目的所属省份 前 40 个={sorted(map(str, df['目的所属省份'].dropna().unique()))[:40]}")

# 类区 -> 省份 关系
lines.append("")
lines.append("=== 类区 × 省份 组合 ===")
combo = df.groupby(["类区", "目的所属省份"], dropna=False).size().reset_index(name="n")
lines.append(f"组合数={len(combo)}")
lines.append(combo.head(40).to_string())

# 时间范围
lines.append("")
g = pd.to_datetime(df["账单时间"], errors="coerce")
lines.append(f"账单时间 min={g.min()} max={g.max()} 无法解析={g.isna().sum()}")

OUT.write_text("\n".join(lines), encoding="utf-8")
print("ok", df.shape)
