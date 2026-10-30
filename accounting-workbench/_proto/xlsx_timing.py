"""Time the one-pass aggregation that replaces the board's 795 SUMIFS formulas."""
from __future__ import annotations

import time
from pathlib import Path

import pandas as pd

SRC = Path(r"C:\Users\13774\Desktop\网管算账工作台\工作簿1.xlsx")
OUT = Path(__file__).resolve().parent / "xlsx" / "timing.txt"

t0 = time.perf_counter()
df = pd.read_excel(SRC, sheet_name="数据原表", engine="openpyxl")
t_read = time.perf_counter() - t0

t0 = time.perf_counter()
work = df.copy()
for col in ("现价", "原价", "结算重量"):
    work[col] = pd.to_numeric(work[col], errors="coerce")
f = work[(work["寄件所属一级网点"] == "义乌稠江") & (work["是否剔除"] == "不剔除") & (work["物品来源"] == "普通物品")]
grp = f.groupby(["目的所属省份", "公斤段"]).agg(
    现价=("现价", "sum"), 原价=("原价", "sum"), 重量=("结算重量", "sum")
).reset_index()
pivots = {
    name: grp.pivot(index="目的所属省份", columns="公斤段", values=col)
    for name, col in (("货量", "重量"), ("现价", "现价"), ("原价", "原价"))
}
t_calc = time.perf_counter() - t0

# 全量口径（不过滤网点）一次性算出所有网点的看板
t0 = time.perf_counter()
allg = work.groupby(["寄件所属一级网点", "是否剔除", "物品来源", "目的所属省份", "公斤段"]).agg(
    现价=("现价", "sum"), 原价=("原价", "sum"), 重量=("结算重量", "sum")
)
t_all = time.perf_counter() - t0

lines = [
    f"数据规模：{df.shape[0]:,} 行 × {df.shape[1]} 列，xlsx {SRC.stat().st_size / 1024 / 1024:.1f} MB",
    f"读取 xlsx（一次性，可缓存为 parquet）：{t_read:.2f} 秒",
    f"单网点看板：筛选 + 一次 groupby + 3 个透视：{t_calc * 1000:.0f} 毫秒",
    f"全量预聚合（129 网点 × 2 剔除 × 2 来源 × 31 省 × 6 段）：{t_all * 1000:.0f} 毫秒",
    f"聚合后组合数：{len(allg):,}",
    "",
    "Excel 侧等价工作量：795 个 SUMIFS，全部使用整列引用（$J:$J 等），",
    f"每次重算约需扫描 {df.shape[0]:,} 行 × 795 次 ≈ {df.shape[0] * 795 / 1e8:.1f} 亿行次。",
]
OUT.write_text("\n".join(lines), encoding="utf-8")
print("\n".join(lines))
