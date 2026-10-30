/**
 * 一键算「网点对比图表」导出组装（纯函数，用户 2026-10-29 定稿）。
 *
 * 一次导出 = 一个文件夹：
 * - 1 张合并大图：picked 行 × 对比指标 的全部系列；
 * - N 张拆分小图：每个分组行一张，只画该行自己的指标线。
 *
 * 与预览保持一致的三处（对应 HANDOVER_NEXT §3.2 的原因 1 / 2 / 3）：
 * - `sort_by: "custom"`：公斤段保持 `board.bands` 的自然顺序，不让后端按字符串重排；
 * - `series_colors`：直接传预览用的 BOARD_PALETTE，导出配色与预览同一套；
 * - 系列名 = `row.label · metric.label`，与界面图例逐字一致。
 */
import type { ChartConfig, ComputeResult } from "../types/api";
import { boardExportBaseName, boardSplitBaseName } from "./exportName";

/** 预览用的品牌色（导出也用它，保证「导出 = 预览」）。 */
export const BOARD_PALETTE = ["#0071e3", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#5ac8fa"];

export type BoardCompareMetricKey = "volume" | "flow" | "discount" | "price";
export type BoardChartKind = "line" | "bar";

/** 一个对比指标：key 取数、label 进图例与文件名、kind 决定纵轴量纲。 */
export interface BoardMetricSpec {
  key: BoardCompareMetricKey;
  label: string;
  kind: "kg" | "pct" | "price";
}

/** 一个公斤段的三个基础数值（与后端 BoardCell 的结构子集一致）。 */
export interface BoardChartCell {
  vol: number;
  price: number;
  orig: number;
}

/** 一个分组行：标签 + 行货量 + 6 个公斤段。 */
export interface BoardChartEntry {
  label: string;
  /** 行货量（该行全部公斤段的 vol 之和）：占比 / 单价 / 折扣都靠它 */
  volume: number;
  cells: BoardChartCell[];
}

export interface BoardChartSeries {
  name: string;
  color: string;
  values: Array<number | null>;
}

/** 一张待导出的图：结果表 + 图表配置（与后端 BoardChartJob 对应）。 */
export interface BoardChartJob {
  result: ComputeResult;
  chart: ChartConfig;
}

/** 单元格按指标取数：货量 / 占本组货量比 / 单价 / 折扣（与预览同一套口径）。 */
export function boardMetricValue(
  cell: BoardChartCell,
  rowVolume: number,
  metric: BoardCompareMetricKey,
): number | null {
  if (metric === "volume") return cell.vol;
  if (metric === "flow") return rowVolume > 0 ? cell.vol / rowVolume : null;
  if (metric === "price") return cell.vol > 0 ? cell.price / cell.vol : null;
  return cell.orig > 0 ? cell.price / cell.orig : null;
}

/** 每个「分组行 × 指标」一条系列，颜色按预览 PALETTE 的顺序取。 */
export function boardSeries(
  entries: BoardChartEntry[],
  metrics: BoardMetricSpec[],
): BoardChartSeries[] {
  return entries.flatMap((entry, entryIndex) =>
    metrics.map((metric, metricIndex) => ({
      name: `${entry.label} · ${metric.label}`,
      color: BOARD_PALETTE[(entryIndex * metrics.length + metricIndex) % BOARD_PALETTE.length],
      values: entry.cells.map((cell) => boardMetricValue(cell, entry.volume, metric.key)),
    })),
  );
}

/**
 * 组装一张图：结果表列 = `公斤段` + 各系列名，行按 `bands` 原序。
 *
 * `y_axis` 写的是**轴标题**（多系列时后端只当标题用，见 `chart/builder.py::_validate`）。
 */
export function buildBoardChartJob(
  entries: BoardChartEntry[],
  bands: string[],
  metrics: BoardMetricSpec[],
  chartType: BoardChartKind,
  title = "网点对比图表",
): BoardChartJob {
  const series = boardSeries(entries, metrics);
  const hasAbsolute = metrics.some((metric) => metric.kind === "kg");
  const result: ComputeResult = {
    columns: ["公斤段", ...series.map((item) => item.name)],
    rows: bands.map((band, bandIndex) => [
      band,
      ...series.map((item) => item.values[bandIndex] ?? null),
    ]),
    row_count: bands.length,
    meta: {},
  };
  const chart: ChartConfig = {
    chart_type: chartType,
    x_axis: "公斤段",
    y_axis: hasAbsolute ? "结算重量（kg）" : "比率 / 单价",
    series: null,
    show_fields: series.map((item) => item.name),
    // 关键：custom = 不排序，保持 bands 自然序（"x" 会变成字符串排序：150-300 跑到 60-150 前面）
    sort_by: "custom",
    sort_order: "asc",
    top_n: null,
    palette: "default",
    title,
    show_legend: true,
    show_data_labels: false,
    time_granularity: null,
    aggregation: "sum",
    series_colors: series.map((item) => item.color),
  };
  return { result, chart };
}

/** 分组行标签的最后一段（`上饶德兴 · 上海市` → `上海市`）。 */
export function labelTailOf(rowLabel: string): string {
  const parts = rowLabel.split(" · ");
  return parts[parts.length - 1] ?? rowLabel;
}

export interface BoardChartPlanInput {
  /** picked：按货量降序的分组行（全部参与，不再截断） */
  entries: BoardChartEntry[];
  bands: string[];
  metrics: BoardMetricSpec[];
  chartType: BoardChartKind;
  /** 顶部勾选的网点（空 = 全部网点） */
  nets: string[];
  /** 分组维度文案，如「网点 × 省份」 */
  dimLabel: string;
  /** 文件名里的「指标」段（勾选的对比指标名，多个用「、」连） */
  metricPart: string;
  /** 功能名，默认「网点对比图表」 */
  featureLabel?: string;
}

export interface BoardChartPlan {
  /** 大图名（= 文件夹名），不含时间戳与扩展名 */
  folderBase: string;
  /** [大图, ...N 张小图]，不含扩展名；顺序与 splits 对齐 */
  fileNames: string[];
  merged: BoardChartJob;
  splits: BoardChartJob[];
  /** 每张小图对应的分组标签（重名时是整行标签） */
  splitLabels: string[];
}

/**
 * 组装整批导出：1 张合并大图 + N 张拆分小图（N = entries.length）。
 *
 * 小图第三段取该行标签的最后一段（`上饶德兴 · 上海市` → `上海市`，与用户给的例子逐字一致）；
 * 若这批里取值重名（多个网点 × 省份时省份会重复），整批退回用完整行标签，后端再兜底 `（2）`。
 */
export function planBoardChartExport(input: BoardChartPlanInput): BoardChartPlan {
  const feature = input.featureLabel ?? "网点对比图表";
  const folderBase = boardExportBaseName({
    scope: "current",
    features: [{ label: feature, metric: input.metricPart }],
    nets: input.nets,
    dimLabel: input.dimLabel,
  });

  const tails = input.entries.map((entry) => labelTailOf(entry.label));
  const duplicated = tails.some((tail, index) => tails.indexOf(tail) !== index);
  const splitLabels = input.entries.map(
    (entry, index) => (duplicated ? entry.label : (tails[index] ?? entry.label)),
  );
  const splitNames = splitLabels.map((label) =>
    boardSplitBaseName({
      feature,
      nets: input.nets,
      splitValue: label,
      metric: input.metricPart,
    }),
  );

  return {
    folderBase,
    fileNames: dedupeNames([folderBase, ...splitNames]),
    merged: buildBoardChartJob(input.entries, input.bands, input.metrics, input.chartType),
    splits: input.entries.map((entry) =>
      buildBoardChartJob([entry], input.bands, input.metrics, input.chartType),
    ),
    splitLabels,
  };
}

/** 同一批里重名追加 `（2）`、`（3）`…（后端还会再兜底一次）。 */
function dedupeNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((name) => {
    const count = used.get(name) ?? 0;
    used.set(name, count + 1);
    return count === 0 ? name : `${name}（${count + 1}）`;
  });
}
