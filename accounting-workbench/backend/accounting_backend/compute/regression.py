"""盈亏平衡与折扣分析的纯计算（无 I/O、无 DataFrame 以外的依赖）。

口径与前端原型 `_proto/shell-demo.html` 的 `regModel()` 完全一致：

* 手动测算：``m = P − C``，``L(Z) = m × Z + B``；
* 表格取数：``P0 = Σ原价 ÷ Σ结算重量``、``P = Σ现价 ÷ Σ结算重量``、``d = P ÷ P0``，
  ``C = 车线成本 + 操作成本``，``利润 = (P0 × 计划折扣 − C) × 计划货量``（不含杂费）；
* 判定：利润 > 0 → 盈利，< 0 → 亏损，= 0 → 持平；手动模式下 ``m_plan < 0`` 但利润仍
  为正时写「盈利（B 兜底）」。
"""

from __future__ import annotations

import itertools
import math
from typing import Iterable, Optional

import pandas as pd

from accounting_backend.compute.time_dimension import apply_time_range
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.regression import (
    GroupPolicy,
    RegressionGroup,
    RegressionManualConfig,
    RegressionManualResult,
    RegressionStep,
    RegressionTableConfig,
    RegressionTableResult,
)

DEFAULT_OP_COST = 0.08
EPSILON = 1e-9


def _money(value: float) -> str:
    """把金额格式化成 ``¥1,234``（与前端 ``regMoney`` 一致）。"""
    if value is None or not math.isfinite(value):
        return "—"
    rounded = 0.0 if abs(value) < 0.5 else value
    return f"{'-¥' if rounded < 0 else '¥'}{abs(rounded):,.0f}"


def _pct(value: Optional[float], digits: int = 2) -> str:
    """把比率格式化成百分比（None 输出 ``—``）。"""
    if value is None or not math.isfinite(value):
        return "—"
    return f"{value * 100:.{digits}f}%"


def _judge(profit: Optional[float], margin: Optional[float] = None) -> str:
    """利润判定：盈利 / 亏损 / 持平；手动模式下允许「盈利（B 兜底）」。"""
    if profit is None or not math.isfinite(profit):
        return "待填值"
    if profit > EPSILON:
        if margin is not None and math.isfinite(margin) and margin < 0:
            return "盈利（B 兜底）"
        return "盈利"
    if profit < -EPSILON:
        return "亏损"
    return "持平"


def _safe_div(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    """安全除法：分母为 0/None 时返回 None（禁止 inf/NaN 泄漏到接口）。"""
    if numerator is None or denominator is None:
        return None
    if not math.isfinite(numerator) or not math.isfinite(denominator) or abs(denominator) < EPSILON:
        return None
    return numerator / denominator


# ────────────────────────── 手动测算 ──────────────────────────


def manual_model(config: RegressionManualConfig) -> RegressionManualResult:
    """计算手动测算的两张卡 + 承诺货量扫描表。"""
    p_now = config.p0 * config.d
    p_plan = config.p0 * config.d_plan
    m_now = p_now - config.c
    m_plan = p_plan - config.c

    revenue_now = p_now * config.z_now + config.b_now
    revenue_plan = p_plan * config.z_plan + config.b_plan
    profit_now = m_now * config.z_now + config.b_now
    profit_plan = m_plan * config.z_plan + config.b_plan

    steps: list[RegressionStep] = []
    for factor in config.step_factors:
        z = config.z_plan * factor
        profit = m_plan * z + config.b_plan
        revenue = p_plan * z + config.b_plan
        steps.append(
            RegressionStep(
                factor=factor,
                z=z,
                break_even_discount=_safe_div(config.c - _safe_div(config.b_plan, z) or 0.0, config.p0),
                profit=profit,
                rate=_safe_div(profit, revenue),
                judge=_judge(profit, m_plan),
            )
        )

    one_pct = (config.p0 * config.z_plan) / 100
    break_even = _safe_div(config.c - _safe_div(config.b_plan, config.z_plan) or 0.0, config.p0)

    advice = (
        f"调整后的针对计划承诺货量 {config.z_plan:,.0f} kg 政策盈利为 {_money(profit_plan)}。"
        f"其中：折扣盈利 {_money(profit_plan - config.b_plan)}"
        f"（{'+' if m_plan >= 0 else '−'}{abs(m_plan):.4f} 元/kg），"
        f"杂费盈利 {_money(config.b_plan)}。"
        f"在计划货量下，1 百分点折扣 ≈ {_money(one_pct)} 杂费。"
        f"当前计划折扣 {_pct(config.d_plan, 2)}，保本折扣 {_pct(break_even, 2)}，"
        f"利润率 {_pct(_safe_div(profit_plan, revenue_plan), 2)}。"
    )

    return RegressionManualResult(
        p_now=p_now,
        m_now=m_now,
        profit_now=profit_now,
        revenue_now=revenue_now,
        rate_now=_safe_div(profit_now, revenue_now),
        p_plan=p_plan,
        m_plan=m_plan,
        profit_plan=profit_plan,
        revenue_plan=revenue_plan,
        rate_plan=_safe_div(profit_plan, revenue_plan),
        one_pct=one_pct,
        break_even_discount=break_even,
        steps=steps,
        advice=advice,
    )


# ────────────────────────── 表格取数 ──────────────────────────


def _cascade_parent(config: RegressionTableConfig) -> Optional[str]:
    """cascade 的父维度字段（第一个带取值的 key）；没有可用的 cascade 返回 None。"""
    for field, mapping in config.cascade.items():
        if mapping:
            return field
    return None


def _cascade_child(dims: list[str], parent: str) -> Optional[str]:
    """cascade 的子维度字段。

    接口上只传了「父字段 → 父值 → 子字段取值」这一层映射，子字段靠 ``dims`` 推断：
    优先取父维度**在 dims 里的下一个字段**（本例 ``["寄件所属一级网点", "目的所属省份", "公斤段"]``
    → ``公斤段``）；父维度是最后一个时退回上一个；都没有返回 None（调用方回退笛卡尔积）。
    """
    if parent not in dims:
        return None
    index = dims.index(parent)
    if index + 1 < len(dims):
        return dims[index + 1]
    if index - 1 >= 0:
        return dims[index - 1]
    return None


def _cascade_combos(config: RegressionTableConfig) -> Optional[list[dict[str, str]]]:
    """按 cascade 展开组合：省份（picks 顺序）→ 网点（picks 顺序）→ 该省勾选的公斤段（勾选顺序）。

    与笛卡尔积的区别就是「每个省份有自己的公斤段集合」：浙江省只勾了 0-60，
    就不会被别的省份的 60-150 带出来（用户 2026-10-29 的例子）。
    """
    parent = _cascade_parent(config)
    if parent is None:
        return None
    child = _cascade_child(list(config.dims), parent)
    if child is None:
        return None
    mapping = config.cascade[parent]

    others = [
        field for field in config.dims if field != parent and field != child and config.picks.get(field)
    ]
    other_values = [list(config.picks[field]) for field in others] if others else []

    # 省份顺序 = picks 里列的顺序（用户点击顺序）；picks 没列时退回 mapping 的键顺序
    province_order = [value for value in config.picks.get(parent, []) if mapping.get(value)]
    if not province_order:
        province_order = [value for value, bands in mapping.items() if bands]

    combos: list[dict[str, str]] = []
    for province in province_order:
        bands = [band for band in mapping.get(province, [])]
        if not bands:
            continue
        for combination in itertools.product(*other_values) if other_values else [()]:
            base = dict(zip(others, combination))
            for band in bands:
                combo = dict(base)
                combo[parent] = province
                combo[child] = band
                combos.append(combo)
    return combos


def _combos(config: RegressionTableConfig) -> list[dict[str, str]]:
    """把勾选取值展开成组合；没有勾选则不拆（合计一行）。

    有 ``cascade`` 时按「父值 → 其余维度 → 该父值勾选的子值」展开（做不到的组合不出现）；
    否则保持原来的笛卡尔积（老项目 / 老请求零影响）。
    """
    cascade = _cascade_combos(config)
    if cascade is not None:
        return cascade
    active_dims = [field for field in config.dims if config.picks.get(field)]
    if not active_dims:
        return [{}]
    value_lists = [list(config.picks[field]) for field in active_dims]
    return [dict(zip(active_dims, values)) for values in itertools.product(*value_lists)]


def _order(config: RegressionTableConfig, combos: list[dict[str, str]]) -> list[str]:
    """标签拼接顺序：dims 里真正出现在组合中的字段（cascade 的子维度也要算上）。

    没有勾选（``combos == [{}]``）时退回全部 dims，让 ``_label`` 输出「全部」。
    """
    present = set(combos[0]) if combos else set()
    if not present:
        return [field for field in config.dims if config.picks.get(field)] or list(config.dims)
    return [field for field in config.dims if field in present]


def _label(combo: dict[str, str], order: Iterable[str]) -> str:
    """按维度顺序拼标签，如「金东三部 · 安徽省 · 0-60」。"""
    parts = [combo[field] for field in order if field in combo]
    return " · ".join(parts) if parts else "全部"


def _resolve_policy(policy: Optional[GroupPolicy], d_now: Optional[float], z: float) -> tuple[float, float, float, float, bool]:
    """组政策：四个值都填了才算 filled；否则用默认值兜底（车线 0、操作 0.08、折扣=当前、货量=数据货量）。"""
    policy = policy or GroupPolicy()
    c_line = 0.0 if policy.c_line is None else float(policy.c_line)
    op_cost = DEFAULT_OP_COST if policy.op_cost is None else float(policy.op_cost)
    d_plan = (d_now if d_now is not None else None) if policy.d_plan is None else float(policy.d_plan)
    z_plan = z if policy.z_plan is None else float(policy.z_plan)
    filled = (
        policy.c_line is not None
        and policy.op_cost is not None
        and policy.d_plan is not None
        and policy.z_plan is not None
    )
    return c_line, op_cost, float(d_plan or 0.0), z_plan, filled


def table_groups(df: pd.DataFrame, config: RegressionTableConfig) -> RegressionTableResult:
    """表格取数：按勾选组合拆组，算每组的 P0 / P / C / 调整前后利润。"""
    required = {"结算重量", "现价", "原价"}
    missing = sorted(required - set(df.columns))
    if missing:
        raise AccountingError("MISSING_FIELDS", f"缺少字段：{'、'.join(missing)}", {"missing": missing})

    ranged, _unknown = apply_time_range(df, config.time_range)
    # 口径过滤：金额列为 0 的行多半是被标记「剔除」的，不先过滤会算出 P0 = 0
    exclude = config.exclude
    if exclude in (None, '', "全部"):
        exclude = None
    source = config.source
    if source in (None, '', "全部"):
        source = None
    if exclude is not None and "是否剔除" in ranged.columns:
        ranged = ranged[ranged["是否剔除"].astype(str) == exclude]
    if source is not None and "物品来源" in ranged.columns:
        ranged = ranged[ranged["物品来源"].astype(str) == source]
    if ranged.empty:
        raise AccountingError("NO_DATA", "所选时间范围内没有数据")

    combos = _combos(config)
    order = _order(config, combos)

    groups: list[RegressionGroup] = []
    empty_combos = 0
    for combo in combos:
        mask = pd.Series(True, index=ranged.index)
        for field, value in combo.items():
            mask &= ranged[field].astype(str) == str(value)
        bucket = ranged[mask]
        if bucket.empty:
            empty_combos += 1
            continue

        z = float(pd.to_numeric(bucket["结算重量"], errors="coerce").sum(skipna=True))
        price = float(pd.to_numeric(bucket["现价"], errors="coerce").sum(skipna=True))
        orig = float(pd.to_numeric(bucket["原价"], errors="coerce").sum(skipna=True))
        p0 = _safe_div(orig, z)
        p = _safe_div(price, z)
        d_now = _safe_div(p, p0)
        key = _label(combo, order)
        c_line, op_cost, d_plan, z_plan, filled = _resolve_policy(config.policies.get(key), d_now, z)
        c = c_line + op_cost
        p_plan = p0 * d_plan if p0 is not None else None
        m_now = (p - c) if p is not None else None
        m_plan = (p_plan - c) if p_plan is not None else None
        profit_now = (m_now or 0.0) * z
        profit_plan = (m_plan * z_plan) if (filled and m_plan is not None) else None

        groups.append(
            RegressionGroup(
                key=key,
                label=key,
                parts=dict(combo),
                row_count=int(len(bucket)),
                z=z,
                price=price,
                orig=orig,
                p0=p0,
                p=p,
                d=d_now,
                c_line=c_line,
                op_cost=op_cost,
                c=c,
                d_plan=d_plan if filled else None,
                z_plan=z_plan if filled else None,
                p_plan=p_plan if filled else None,
                profit_now=profit_now,
                profit_plan=profit_plan,
                rate_now=_safe_div(profit_now, price),
                rate_plan=_safe_div(profit_plan, p_plan * z_plan) if (filled and p_plan) else None,
                filled=filled,
            )
        )

    if not groups:
        raise AccountingError("NO_DATA", "当前勾选没有数据")

    filled_groups = [group for group in groups if group.filled]
    z_all = sum(group.z for group in groups)
    price_all = sum(group.price for group in groups)
    orig_all = sum(group.orig for group in groups)
    z_plan_all = sum(group.z_plan or 0.0 for group in filled_groups)
    revenue_now = price_all
    revenue_plan = sum((group.p_plan or 0.0) * (group.z_plan or 0.0) for group in filled_groups)
    profit_now_all = sum(group.profit_now for group in groups)
    profit_plan_all = sum(group.profit_plan or 0.0 for group in filled_groups)
    has_plan = bool(filled_groups)

    p0_all = _safe_div(orig_all, z_all)
    p_all = _safe_div(price_all, z_all)
    d_all = _safe_div(p_all, p0_all)
    p_plan_all = _safe_div(revenue_plan, z_plan_all) if has_plan and z_plan_all else None
    one_pct = (p0_all * z_plan_all / 100) if (has_plan and p0_all is not None) else None

    if not has_plan:
        advice = (
            "填完每张卡片的四个值（车线成本 / 操作成本 / 计划折扣 / 计划货量）后，这里给出调整盈亏情况分析。"
            f"已填 0 / {len(groups)} 组。"
        )
    else:
        rate_plan_all = _safe_div(profit_plan_all, revenue_plan)
        advice = (
            f"调整后的针对计划承诺货量 {z_plan_all:,.0f} kg 政策盈利为 {_money(profit_plan_all)}。其中："
            f"折扣盈利 {_money(profit_plan_all)}"
            f"（{'+' if (p_plan_all or 0) - (groups[0].c if groups else 0) >= 0 else '−'}），"
            f"利润率 {_pct(rate_plan_all, 2)}。"
            f"在计划货量下，1 百分点折扣 ≈ {_money(one_pct or 0)}。"
        )

    return RegressionTableResult(
        groups=groups,
        empty_combos=empty_combos,
        filled_count=len(filled_groups),
        z=z_all,
        z_plan=z_plan_all if has_plan else None,
        price=price_all,
        orig=orig_all,
        p0=p0_all,
        p=p_all,
        d=d_all,
        d_plan=_safe_div(p_plan_all, p0_all) if (has_plan and p_plan_all and p0_all) else None,
        revenue_now=revenue_now,
        revenue_plan=revenue_plan if has_plan else None,
        profit_now=profit_now_all,
        profit_plan=profit_plan_all if has_plan else None,
        rate_now=_safe_div(profit_now_all, revenue_now),
        rate_plan=_safe_div(profit_plan_all, revenue_plan) if has_plan else None,
        one_pct=one_pct,
        advice=advice,
    )
