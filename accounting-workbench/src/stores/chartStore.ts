import { create } from "zustand";
import type { ChartConfig } from "../types/api";
import { withXDims, xDimsOf } from "../utils/chartData";
import { useDirtyStore } from "./dirtyStore";

export const DEFAULT_CHART_CONFIG: ChartConfig = {
  chart_type: "bar",
  x_axis: null,
  y_axis: null,
  series: null,
  show_fields: [],
  sort_by: "x",
  sort_order: "asc",
  top_n: null,
  palette: "default",
  title: "",
  show_legend: true,
  show_data_labels: false,
  time_granularity: null,
  aggregation: "sum",
  // X 轴叠加的维度：空 = 只有 x_axis 单字段（老项目的形态）
  x_dims: [],
};

interface ChartState {
  config: ChartConfig;
  updateConfig: (patch: Partial<ChartConfig>) => void;
  resetConfig: () => void;
  /** 只清 X 轴（回到「—」），Y 指标 / 图表类型 / 排序 / 标题都保留。 */
  resetXAxis: () => void;
}

export const useChartStore = create<ChartState>((set, get) => ({
  config: { ...DEFAULT_CHART_CONFIG },

  updateConfig: (patch) => {
    useDirtyStore.getState().markDirty();
    set({ config: { ...get().config, ...patch } });
  },

  resetConfig: () => {
    set({ config: { ...DEFAULT_CHART_CONFIG } });
  },

  /** 分析配置变了重算时用：X 轴的字段与取值一起忘掉，但不连累 Y 指标。 */
  resetXAxis: () => {
    const config = get().config;
    if (xDimsOf(config).length === 0 && config.x_axis === null) return;
    set({ config: { ...config, ...withXDims([]) } });
  },
}));
