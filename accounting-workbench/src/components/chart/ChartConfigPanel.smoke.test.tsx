import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import ChartConfigPanel from "./ChartConfigPanel";
import { useAnalysisStore } from "../../stores/analysisStore";
import { useChartStore } from "../../stores/chartStore";
import type { ComputeResult } from "../../types/api";

/** 图表面板结构冒烟（2026-10-28：X 轴叠加维度 + 浮层改 portal 后加的保护）。
 *
 * zustand v5 的 SSR 用 getInitialState 作快照，所以先把当前状态拷进初始状态。
 * 浮层本身要点开才渲染（portal），这里只保证面板本身能渲染、按钮文案对。
 */

const RESULT: ComputeResult = {
  columns: ["寄件所属一级网点", "目的所属省份", "公斤段", "现价合计", "货量"],
  rows: [
    ["金华婺城", "浙江省", "0-60", 100, 10],
    ["义乌铁路口岸", "广东省", "0-60", 50, 5],
  ],
  row_count: 2,
  meta: {},
};

function renderPanel(): string {
  Object.assign(useAnalysisStore.getInitialState(), useAnalysisStore.getState());
  Object.assign(useChartStore.getInitialState(), useChartStore.getState());
  return renderToString(<ChartConfigPanel />);
}

describe("ChartConfigPanel 结构冒烟", () => {
  beforeEach(() => {
    useAnalysisStore.setState({ result: RESULT });
    useChartStore.setState({
      config: { ...useChartStore.getState().config, x_axis: null, x_dims: [], show_fields: [] },
    });
  });

  it("三行控件都在，X 轴未选时显示 —", () => {
    const html = renderPanel();
    expect(html.includes("图表类型")).toBe(true);
    expect(html.includes("X 轴")).toBe(true);
    expect(html.includes("Y 指标")).toBe(true);
    expect(html.includes("—")).toBe(true);
    expect(html.includes("折线")).toBe(true);
    expect(html.includes("现价合计")).toBe(true);
    // 散点图已于 2026-10-30（第 14 轮）下线：面板里不能再出现这个入口
    expect(html.includes("散点")).toBe(false);
  });

  it("已叠加两个维度时按钮文案 = 字段 × 字段（浮层收起时不渲染）", () => {
    useChartStore.setState({
      config: {
        ...useChartStore.getState().config,
        x_dims: [{ field: "寄件所属一级网点" }, { field: "公斤段", values: ["0-60"] }],
        x_axis: "寄件所属一级网点",
      },
    });
    const html = renderPanel();
    expect(html.includes("寄件所属一级网点 × 公斤段")).toBe(true);
    expect(html.includes("已选 1 项")).toBe(true);
    // 浮层是点开才挂到 body 上的，服务端渲染时不该出现
    expect(html.includes('role="dialog"')).toBe(false);
  });
});
