"""一键算（看板）的输入/输出模型。

口径（与 `_proto/shell-demo.html` 的 `buildBoardMerged()` / `boardSlice()` 一致）：

* 行 = 分组维度组合（网点 / 省份 / 网点×省份），列 = 6 个公斤段；
* 每个单元格存 结算重量求和、现价求和、原价求和，派生 ``折扣 = 现价/原价``、``单价 = 现价/结算重量``；
* 汇总：``综合折扣 = Σ现价 ÷ Σ原价``、``综合单价 = Σ现价 ÷ Σ结算重量``（加权），
  另给「有货量的单元格简单平均」作对照；
* 货物流向数据 = 该单元格的结算重量求和（kg），占比 = 该单元格 ÷ 行合计。
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from accounting_backend.schemas.analysis import TimeRange

BOARD_BANDS: list[str] = ["0-60", "60-150", "150-300", "300-500", "500-800", "800+"]
DIM_FIELD = {"网点": "寄件所属一级网点", "省份": "目的所属省份"}

BoardDim = Literal["网点", "省份"]


class BoardConfig(BaseModel):
    """看板筛选条件与分组维度。"""

    time_range: TimeRange
    nets: list[str] = Field(default_factory=list, description="勾选的网点（空 = 全部）")
    exclude: str = Field("不剔除", description="「是否剔除」口径")
    source: Optional[str] = Field(default=None, description="「物品来源」口径；None = 不过滤")
    dims: list[BoardDim] = Field(default_factory=lambda: ["省份"])
    dim_values: dict[str, list[str]] = Field(default_factory=dict)


class BoardCell(BaseModel):
    """一个公斤段（或一行合计）的数值。"""

    vol: float
    price: float
    orig: float
    disc: Optional[float]
    unit: Optional[float]


class BoardRow(BaseModel):
    """一个分组（一行的 6 个公斤段）。"""

    label: str
    cells: list[BoardCell]


class BoardResult(BaseModel):
    """看板渲染需要的全部数值，前端不再二次计算。"""

    rows: list[BoardRow]
    bands: list[str]
    band_totals: list[BoardCell]
    sum_vol: float
    sum_price: float
    sum_orig: float
    weighted_disc: Optional[float]
    weighted_unit: Optional[float]
    simple_disc: Optional[float]
    simple_unit: Optional[float]
    dim_label: str
    row_count: int
    scanned: int
    filtered: int


class BoardDimSources(BaseModel):
    """维度候选值：省份只能是已选网点覆盖到的省份。"""

    nets: list[str]
    provinces: list[str]
