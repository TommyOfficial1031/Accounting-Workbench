"""盈亏平衡与折扣分析（回归）的输入/输出模型。

口径（与 `_proto/shell-demo.html` 的 `regModel()` 一致，用户已定稿）：

* ``m = P − C``（单公斤利润），``L(Z) = m × Z + B``；
* 调整前用当前折扣/当前杂费/当前货量，调整后用计划折扣/计划杂费/计划货量；
* 保本折扣 ``d* = (C − B / Z) ÷ P0``（随 Z 变化，B 可以顶替折扣）；
* 1 个百分点折扣 ≈ ``P0 × Z ÷ 100``（元）；
* 表格取数模式不含杂费：``利润 = (P − C) × Z``。
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from accounting_backend.schemas.analysis import TimeRange


class RegressionManualConfig(BaseModel):
    """手动测算的输入（单组）。"""

    p0: float = Field(gt=0, description="原价（元/kg）")
    d: float = Field(gt=0, le=2, description="当前折扣（0.88 = 88%）")
    d_plan: float = Field(gt=0, le=2, description="计划折扣")
    b_now: float = Field(0.0, description="当前杂费（元）")
    b_plan: float = Field(0.0, description="计划杂费（元）")
    c: float = Field(ge=0, description="C = 车线成本 + 操作成本（元/kg）")
    z_now: float = Field(gt=0, description="当前货量（kg）")
    z_plan: float = Field(gt=0, description="计划承诺货量（kg）")
    step_factors: list[float] = Field(
        default_factory=lambda: [0.5, 1.0, 1.5, 2.0, 3.0],
        description="承诺货量扫描倍数（相对计划货量）",
    )


class RegressionStep(BaseModel):
    """承诺货量扫描表的一行。"""

    factor: float
    z: float
    break_even_discount: Optional[float]
    profit: float
    rate: Optional[float]
    judge: str


class RegressionManualResult(BaseModel):
    """手动测算的结果（两张卡 + 扫描表）。"""

    p_now: float
    m_now: float
    profit_now: float
    revenue_now: float
    rate_now: Optional[float]

    p_plan: float
    m_plan: float
    profit_plan: float
    revenue_plan: float
    rate_plan: Optional[float]

    one_pct: float
    break_even_discount: Optional[float]
    steps: list[RegressionStep]
    advice: str


class GroupPolicy(BaseModel):
    """某一组的手填政策。四个都没填时 ``filled`` 为 False，只出调整前。"""

    c_line: Optional[float] = None
    op_cost: Optional[float] = None
    d_plan: Optional[float] = None
    z_plan: Optional[float] = None


class RegressionTableConfig(BaseModel):
    """表格取数的输入。"""

    time_range: TimeRange
    dims: list[str] = Field(
        default_factory=lambda: ["寄件所属一级网点", "公斤段", "目的所属省份"],
        description="可拆分的分组维度（顺序即标签拼接顺序）",
    )
    picks: dict[str, list[str]] = Field(
        default_factory=dict,
        description="每个维度的勾选取值；某维度为空表示该维度不参与拆分",
    )
    cascade: dict[str, dict[str, list[str]]] = Field(
        default_factory=dict,
        description=(
            "父维度字段 → 父值 → 子维度取值集合，如 "
            "{'目的所属省份': {'安徽省': ['0-60', '60-150'], '浙江省': ['0-60']}}；"
            "为空时按 picks 做笛卡尔积（老请求零影响）"
        ),
    )
    policies: dict[str, GroupPolicy] = Field(
        default_factory=dict, description="组 key（标签）→ 该组手填的四个值"
    )
    exclude: Optional[str] = Field("不剔除", description="「是否剔除」口径；None = 不过滤")
    source: Optional[str] = Field(None, description="「物品来源」口径；None = 不过滤")


class RegressionGroup(BaseModel):
    """表格取数的一个分组（= 一张卡片 / 一张小图 / 汇算表一行）。"""

    key: str
    label: str
    parts: dict[str, str] = Field(
        default_factory=dict,
        description="结构化组合（字段 → 取值），如 {'目的所属省份': '安徽省', '公斤段': '0-60'}；"
        "「按省份统一写成本」靠它分组，不用切标签字符串",
    )
    row_count: int
    z: float
    price: float
    orig: float
    p0: Optional[float]
    p: Optional[float]
    d: Optional[float]
    c_line: float
    op_cost: float
    c: float
    d_plan: Optional[float]
    z_plan: Optional[float]
    p_plan: Optional[float]
    profit_now: float
    profit_plan: Optional[float]
    rate_now: Optional[float]
    rate_plan: Optional[float]
    filled: bool


class RegressionTableResult(BaseModel):
    """表格取数的结果（分组 + 合计）。"""

    groups: list[RegressionGroup]
    empty_combos: int = 0
    filled_count: int = 0
    z: float
    z_plan: Optional[float]
    price: float
    orig: float
    p0: Optional[float]
    p: Optional[float]
    d: Optional[float]
    d_plan: Optional[float]
    revenue_now: float
    revenue_plan: Optional[float]
    profit_now: float
    profit_plan: Optional[float]
    rate_now: Optional[float]
    rate_plan: Optional[float]
    one_pct: Optional[float]
    advice: str
