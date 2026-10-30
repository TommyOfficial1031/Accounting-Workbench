"""图表渲染的 Pydantic 模型（字段名与前端 types/api.ts 的 ChartConfig 一致）。"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from accounting_backend.schemas.analysis import ComputeResult


class ChartXDim(BaseModel):
    """X 轴叠加的一个维度：字段 + 勾选的取值（缺省 / 空 = 全部）。

    组合标签（``值1·值2``）由前端在导出前烘焙成结果表里的一列，
    后端 matplotlib 渲染只认列名，这里保留字段只是让请求体前后端一致。
    """

    field: str
    values: Optional[list[str]] = None


class ChartConfig(BaseModel):
    #: 散点图已于 2026-10-30（第 14 轮）按用户要求下线，请求里再传 scatter 会 422
    chart_type: Literal["line", "bar", "column", "pie"]
    x_axis: Optional[str] = None
    y_axis: Optional[str] = None
    series: Optional[str] = None
    show_fields: list[str] = Field(default_factory=list)
    sort_by: Literal["x", "y", "custom"] = "x"
    sort_order: Literal["asc", "desc"] = "asc"
    top_n: Optional[int] = None
    palette: str = "default"
    title: str = ""
    show_legend: bool = True
    show_data_labels: bool = False
    time_granularity: Optional[Literal["day", "month", "quarter", "year"]] = None
    aggregation: Literal["sum", "avg", "max", "min", "first", "last"] = "sum"
    #: X 轴叠加的维度（2026-10-28 起）；已由前端烘焙进 x_axis 列
    x_dims: list[ChartXDim] = Field(default_factory=list)
    #: 按顺序给系列上色（空 = 用 palette）。一键算看板传预览同一套 PALETTE，
    #: 保证「导出 = 预览」的颜色（用户 2026-10-29 反馈导出色和预览不一样）
    series_colors: list[str] = Field(default_factory=list)


class RenderOpts(BaseModel):
    figsize: Optional[list[float]] = None
    dpi: int = 300
    quality: int = 90
    optimize: bool = True


class ChartRenderRequest(BaseModel):
    result: ComputeResult
    chart: ChartConfig
    format: str = "pdf"
    render_opts: RenderOpts = Field(default_factory=RenderOpts)
    # 传了 path 就直接写盘（前端已弹过保存框），不传则返回二进制流
    path: Optional[str] = None
