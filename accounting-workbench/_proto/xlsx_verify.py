"""Verify: recompute the board with pandas and compare against Excel cached values."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

SRC = Path(r"C:\Users\13774\Desktop\网管算账工作台\工作簿1.xlsx")
OUT = Path(__file__).resolve().parent / "xlsx" / "verify.txt"

BANDS = ["0-60", "60-150", "150-300", "300-500", "500-800", "800+"]
NET = "义乌稠江"
EXCLUDE = "不剔除"
SOURCE = "普通物品"

df = pd.read_excel(SRC, sheet_name="数据原表", engine="openpyxl")
board = pd.read_excel(SRC, sheet_name="看板", engine="openpyxl", header=None)

lines: list[str] = []
lines.append(f"看板形状={board.shape}")

# Excel 缓存值：行 4..36 对应 DataFrame 索引 3..35
def cached(row_1based: int, col_1based: int):
    return board.iloc[row_1based - 1, col_1based - 1]

lines.append("")
lines.append("=== 看板汇总区缓存值 ===")
for name, cell in [("N1 累计货量", (1, 14)), ("P1 综合折扣", (1, 16)), ("R1 综合单价", (1, 18))]:
    lines.append(f"{name} = {cached(*cell)!r}")

# pandas 重算
work = df.copy()
for col in ["现价", "原价", "结算重量"]:
    work[col] = pd.to_numeric(work[col], errors="coerce")

base = work[(work["寄件所属一级网点"] == NET) & (work["是否剔除"] == EXCLUDE) & (work["物品来源"] == SOURCE)]
lines.append("")
lines.append(f"=== 筛选：网点={NET} 剔除={EXCLUDE} 来源={SOURCE} ===")
lines.append(f"命中行数={len(base)}  该口径总货量={base['结算重量'].sum():.4f}")

grp = base.groupby(["目的所属省份", "公斤段"]).agg(
    现价=("现价", "sum"), 原价=("原价", "sum"), 重量=("结算重量", "sum")
).reset_index()

pivot_w = grp.pivot(index="目的所属省份", columns="公斤段", values="重量")
pivot_p = grp.pivot(index="目的所属省份", columns="公斤段", values="现价")
pivot_o = grp.pivot(index="目的所属省份", columns="公斤段", values="原价")
total_w = base["结算重量"].sum()

def value(frame: pd.DataFrame, province: str, band: str):
    if province not in frame.index or band not in frame.columns:
        return None
    v = frame.loc[province, band]
    return None if pd.isna(v) else float(v)

lines.append("")
lines.append("=== 逐格对比（前 6 行 × 首段）===")
lines.append("行 | 省份 | 货量(Excel) | 货量(pandas) | 占比(Excel) | 占比(pandas) | 折扣(Excel) | 折扣(pandas) | 单价(Excel) | 单价(pandas)")
max_diffs = {"货量": 0.0, "占比": 0.0, "折扣": 0.0, "单价": 0.0}
for r in range(4, 37):
    province = board.iloc[r - 1, 1]
    if not isinstance(province, str):
        continue
    # C 列=货量, D 列=占比, O 列=折扣, U 列=单价（均首段 0-60）
    x_w, x_ratio, x_disc, x_price = cached(r, 3), cached(r, 4), cached(r, 15), cached(r, 21)
    p_w = value(pivot_w, province, "0-60")
    p_ratio = (p_w / total_w) if (p_w is not None and total_w) else None
    p_disc = None
    p_price = None
    pp, oo = value(pivot_p, province, "0-60"), value(pivot_o, province, "0-60")
    if pp is not None and oo not in (None, 0):
        p_disc = pp / oo
    if pp is not None and p_w not in (None, 0):
        p_price = pp / p_w
    if r <= 9:
        lines.append(f"{r} | {province} | {x_w!r} | {p_w!r} | {x_ratio!r} | {p_ratio!r} | {x_disc!r} | {p_disc!r} | {x_price!r} | {p_price!r}")

    def diff(a, b):
        if a in (None, "") or b is None:
            return 0.0
        try:
            return abs(float(a) - float(b))
        except (TypeError, ValueError):
            return 0.0

    max_diffs["货量"] = max(max_diffs["货量"], diff(x_w, p_w))
    max_diffs["占比"] = max(max_diffs["占比"], diff(x_ratio, p_ratio))
    max_diffs["折扣"] = max(max_diffs["折扣"], diff(x_disc, p_disc))
    max_diffs["单价"] = max(max_diffs["单价"], diff(x_price, p_price))

lines.append("")
lines.append(f"最大绝对误差（首段 0-60，全部 33 行）：{max_diffs}")
lines.append(f"累计货量 N1 Excel={cached(1, 14)!r}  pandas={total_w:.4f}")

# 综合折扣/单价：简单平均 vs 加权
ratios = []
prices = []
for province in board.iloc[3:36, 1]:
    if not isinstance(province, str):
        continue
    for band in BANDS:
        w = value(pivot_w, province, band)
        p = value(pivot_p, province, band)
        o = value(pivot_o, province, band)
        if p is not None and o not in (None, 0):
            ratios.append(p / o)
        if p is not None and w not in (None, 0):
            prices.append(p / w)

weighted_disc = base["现价"].sum() / base["原价"].sum()
weighted_price = base["现价"].sum() / base["结算重量"].sum()
lines.append("")
lines.append("=== 综合口径差异 ===")
lines.append(f"P1 综合折扣 Excel(简单平均)={cached(1, 16)!r}  pandas 简单平均={sum(ratios)/len(ratios):.6f}  加权={weighted_disc:.6f}")
lines.append(f"R1 综合单价 Excel(简单平均)={cached(1, 18)!r}  pandas 简单平均={sum(prices)/len(prices):.6f}  加权={weighted_price:.6f}")
lines.append(f"参与平均的单元格数：折扣 {len(ratios)} / 单价 {len(prices)}（33 行 × 6 段 = 198 上限）")

OUT.write_text("\n".join(lines), encoding="utf-8")
print("ok")
