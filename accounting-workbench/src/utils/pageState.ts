/** 三个工具页的输入快照：随项目保存，打开项目时回填。只存输入，不存结果。 */

import type { AnalysisFilterRow, LegacyMetricRow, MetricBox } from "./analysisRows";
import type { RegressionManualConfig } from "../types/api";

export interface AnalysisSnapshot {
  chart?: Record<string, unknown>;
  chartXSel?: Record<string, string[]>;
  chartY?: string[];
  legendNames?: Record<string, string>;
  /** 分析页的条件行。 */
  filterRows?: AnalysisFilterRow[];
  /** 指标框（2026-10-27 起：一个指标 = 一行表达式，含括号）。 */
  metricBoxes?: MetricBox[];
  /** 旧版指标行（读旧项目时按 AND 切成指标框）。 */
  metricRows?: LegacyMetricRow[];
  timePreset?: "本月" | "上月" | "自定义";
  timeStart?: string;
  timeEnd?: string;
}

export interface BoardSnapshot {
  nets: string[];
  exclude: string;
  source: string;
  dims: Array<"网点" | "省份">;
}

export interface PolicySnapshot {
  c_line: string;
  op_cost: string;
  d_plan: string;
  z_plan: string;
}

export interface RegressionSnapshot {
  mode: "table" | "manual";
  manual: RegressionManualConfig;
  /** 手动模式的成本拆分（C = 车线 + 操作）。 */
  cLine?: string;
  opCost?: string;
  dims: string[];
  picks: Record<string, string[]>;
  /** 级联勾选：省份 → 该省勾选的公斤段（第 11 轮 A①；老快照没有这个字段）。 */
  cascade?: Record<string, Record<string, string[]>>;
  policies: Record<string, PolicySnapshot>;
}

export interface ProjectStateSnapshot {
  analysis?: AnalysisSnapshot;
  board?: BoardSnapshot;
  regression?: RegressionSnapshot;
}

/** 判断一个未知对象是否像快照（避免把脏数据写进项目）。 */
export function isSnapshot(value: unknown): value is ProjectStateSnapshot {
  return typeof value === "object" && value !== null;
}
