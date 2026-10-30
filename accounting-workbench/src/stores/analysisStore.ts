import { create } from "zustand";
import { renderChart, renderChartToPath } from "../api/chart";
import { applyChartDisplay, reconcileChartConfig, xDimPickedCount, xDimsOf } from "../utils/chartData";
import { compute as apiCompute } from "../api/compute";
import { exportTableBytes, exportTableToPath, type ExportFormat } from "../api/export";
import { fetchTimeRange } from "../api/import";
import { fetchValues } from "../api/values";
import { downloadBlob, isTauri, pickSavePath } from "../utils/platform";
import type {
  AggFunc,
  AnalysisConfig,
  ComputeResult,
  DatasetMeta,
  DerivedMetric,
  FixedRuleInfo,
  TimeRange,
} from "../types/api";
import {
  applyOpChoice,
  appendMetricSlot,
  boxesFromLegacyRows,
  buildAnalysisConfig,
  defaultFilterRow,
  defaultMetricBox,
  derivedMetricsOf,
  filledSlots,
  metricSlots,
  nextRowId,
  presetRange,
  removeMetricParen,
  removeMetricSlot,
  rowsFromConfig,
  rowsFromRule,
  type AnalysisFilterRow,
  type LegacyMetricRow,
  type MetricBox,
  type MetricOpChoice,
} from "../utils/analysisRows";
import { useChartStore } from "./chartStore";
import { useExportStore } from "./exportStore";
import { useDirtyStore } from "./dirtyStore";
import { getCurrentProjectRef } from "./projectRef";

/** 上限：指标框最多 8 个（对应「指标1…8」），条件最多 40 条。 */
export const MAX_METRIC_BOXES = 8;
/** 单个指标框里的字段槽上限（含被删剩下的空槽）。 */
export const MAX_METRIC_SLOTS = 20;
export const MAX_FILTER_ROWS = 40;

export type TimePreset = "本月" | "上月" | "自定义";

const TIME_FIELD = "账单时间";
const UNBOUNDED: TimeRange = {
  start: "1970-01-01",
  end: "2999-12-31",
  field: TIME_FIELD,
};

/** 自动识别出的时间范围（第 11 轮 C）。 */
export interface DetectedRange {
  field: string;
  start: string;
  end: string;
}

/** 当前时间范围是否还是「全量」兜底（识别出来之前 / 识别不出来）。 */
function isUnbounded(range: TimeRange | null): boolean {
  if (range === null) return true;
  return range.start === UNBOUNDED.start && range.end === UNBOUNDED.end;
}

function initialTimeRange(dataset: DatasetMeta | null): TimeRange {
  if (dataset === null) return { ...UNBOUNDED };
  const timeColumn = dataset.columns.find((column) => column.name === TIME_FIELD);
  // 没有「账单时间」时退回第一列：解析失败的行按「未知日期」全部保留，
  // 等价于不按时间筛（后端 apply_time_range 的行为）。
  // 默认范围 = 全量，等 /api/dataset/{id}/time-range 识别出来后由 ensureDetectedRange 预填
  // （用户 2026-10-29 定稿：取消默认「本月」，改成「自定义」+ 识别出的范围）。
  const field = timeColumn?.name ?? dataset.columns[0]?.name ?? TIME_FIELD;
  return { ...UNBOUNDED, field };
}

/** 移动一行：条件行整体搬家（比较运算符跟着走）。 */
function moveEntry<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 指标框里所有字段槽的字段名（拉候选值用）。 */
function boxFields(boxes: MetricBox[]): string[] {
  return boxes.flatMap((box) => metricSlots(box).map((slot) => slot.field)).filter((field) => field.trim() !== "");
}

/** Windows 文件名不能带这些半角字符；提示语与导出名统一走这里。 */
function safeFileName(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, "·").replace(/\s+/g, " ").trim();
}

/** 导出用的时间戳：YYYY-MM-DD HH：MM（全角冒号，Windows 合法）。 */
function stampMinute(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}：${pad(date.getMinutes())}`;
}

/**
 * 上一次成功计算时的分析配置签名（用户 2026-10-28 第六轮 C 方案 A）。
 *
 * 配置变了 → 重算后把 X 轴清空（回到「—」）；配置没变（重复点「开始计算」）→ 只清失效项。
 * 换项目 / 重进分析页时清掉，免得拿上一个项目的签名误判（那样会白清一次 X 轴）。
 */
let lastComputeSignature: string | null = null;

/** 换数据集 / 恢复项目快照时调：下一次计算按「首次」处理，不清 X 轴。 */
function forgetComputeSignature(): void {
  lastComputeSignature = null;
}

interface AnalysisState {
  dataset: DatasetMeta | null;
  ruleName: string | null;
  timePreset: TimePreset;
  timeRange: TimeRange | null;
  filterRows: AnalysisFilterRow[];
  /** 指标框：一个框 = 一个指标 = 一行表达式。 */
  metricBoxes: MetricBox[];
  /** 计算结果的列（图表配置要用），随指标框同步。 */
  derivedMetrics: DerivedMetric[];
  /** 字段 → 候选值（当前时间范围内）；空数组表示该字段范围内无数据。 */
  valueOptions: Record<string, string[]>;
  valuesSignature: string;
  result: ComputeResult | null;
  loading: boolean;
  error: string | null;
  toast: string | null;
  /** 自动识别出的时间范围（进入分析/一键算/盈亏平衡时取一次，带缓存）。 */
  detectedRange: DetectedRange | null;
  /** 已经为哪个数据集取过（= 缓存键，换数据集才会重新请求）。 */
  detectedFor: string | null;
  /** 进页面时调一次：识别时间字段的 min~max，并在「自定义」下预填。 */
  ensureDetectedRange: (datasetId: string) => Promise<void>;
  openForRule: (rule: FixedRuleInfo, dataset: DatasetMeta) => void;
  openFree: (dataset: DatasetMeta) => void;
  setTimePreset: (preset: TimePreset) => void;
  setTimeRange: (start: string, end: string) => void;
  addFilterRows: (fields: string[]) => void;
  updateFilterRow: (id: string, patch: Partial<AnalysisFilterRow>) => void;
  removeFilterRow: (id: string) => void;
  moveFilterRow: (id: string, direction: -1 | 1) => void;
  /** 拖到目标行上（原型 ⋮⋮ 拖动排序）。 */
  moveFilterRowTo: (id: string, targetId: string) => void;
  /** 标题栏 `+`：每个字段新建一个指标框（指标1…N）。 */
  addMetricBoxes: (fields: string[]) => void;
  /** 指标框内 `+`：往这个指标追加字段槽（字段 + 计算方式）。 */
  addMetricSlots: (boxId: string, fields: string[]) => void;
  /** 改字段槽的字段 / 计算方式。 */
  updateMetricSlot: (boxId: string, slotId: string, patch: { field?: string; agg?: AggFunc }) => void;
  removeMetricSlot: (boxId: string, slotId: string) => void;
  removeMetricBox: (boxId: string) => void;
  moveMetricBox: (boxId: string, direction: -1 | 1) => void;
  moveMetricBoxTo: (boxId: string, targetId: string) => void;
  /** 改运算符（含 `(` / `)` 的自动配对与自动补位）。 */
  setMetricOp: (boxId: string, tokenId: string, choice: MetricOpChoice) => void;
  /** 删掉一个括号记号。 */
  removeMetricParenToken: (boxId: string, tokenId: string) => void;
  /** 展开 / 合并某个指标框。 */
  toggleMetricCollapse: (boxId: string) => void;
  loadValues: (fields?: string[]) => Promise<void>;
  setToast: (message: string | null) => void;
  clearToast: () => void;
  /** 双击表头改名（导出用改后的名字）。 */
  renameResultColumn: (index: number, name: string) => void;
  /** 双击单元格改值（聚合结果的就地修正，导出用改后的值）。 */
  editResultCell: (rowIndex: number, columnIndex: number, value: string) => void;
  compute: () => Promise<void>;
  /** 导出结果表（xlsx / xls / csv），返回给用户看的提示语。 */
  exportTable: (format: ExportFormat) => Promise<string>;
  /** 导出当前图表（pdf / jpeg），返回提示语。 */
  exportChart: (format: "pdf" | "jpeg") => Promise<string>;
  restore: (
    config: AnalysisConfig | null,
    dataset: DatasetMeta,
    ruleName: string | null,
    result: ComputeResult | null,
  ) => void;
  /** 项目快照回填：直接还原行模型（含固定规则的专属列名）。 */
  restoreRows: (payload: {
    filterRows: AnalysisFilterRow[];
    metricBoxes?: MetricBox[];
    /** 旧版项目快照里的指标行（按 AND 切成指标框）。 */
    metricRows?: LegacyMetricRow[];
    timePreset?: TimePreset;
    start?: string;
    end?: string;
  }) => void;
  buildConfig: () => AnalysisConfig | null;
  reset: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => {
  /** 指标框变了以后统一重算派生列，避免界面与配置不一致。 */
  function commitBoxes(boxes: MetricBox[], toast?: string | null): void {
    useDirtyStore.getState().markDirty();
    set({
      metricBoxes: boxes,
      derivedMetrics: derivedMetricsOf(boxes),
      ...(toast === undefined ? {} : { toast }),
    });
  }

  function updateBox(boxId: string, patch: (box: MetricBox) => MetricBox): void {
    const boxes = get().metricBoxes.map((box) => (box.id === boxId ? patch(box) : box));
    commitBoxes(boxes);
  }

  return {
    dataset: null,
    ruleName: null,
    timePreset: "自定义",
    timeRange: null,
    filterRows: [],
    metricBoxes: [],
    derivedMetrics: [],
    valueOptions: {},
    valuesSignature: "",
    result: null,
    loading: false,
    error: null,
    toast: null,
    detectedRange: null,
    detectedFor: null,

    ensureDetectedRange: async (datasetId) => {
      // 已经识别过这个数据集：**仍然要把识别结果预填一次**。
      // 原来这里是直接 return，导致「先进盈亏平衡（识别成功、缓存写好）→ 再去分析 / 一键算」
      // 时永远不预填（用户 2026-10-29 反馈：一键算日期是空的、分析页给的是 1970~2999 全量兜底）。
      if (get().detectedFor === datasetId) {
        const cached = get().detectedRange;
        if (cached !== null && isUnbounded(get().timeRange) && get().timePreset === "自定义") {
          set({ timeRange: { ...cached } });
        }
        return;
      }
      try {
        const info = await fetchTimeRange(datasetId);
        const field = info.field ?? get().timeRange?.field ?? TIME_FIELD;
        const detected: DetectedRange | null =
          info.start !== null && info.end !== null
            ? { field, start: info.start, end: info.end }
            : null;
        // 标记「取过了」：识别不出时间字段也记下来，免得每次进页面都打一次接口
        set({ detectedRange: detected, detectedFor: datasetId });
        const current = get().timeRange;
        // 只在「还没被用户改过」时预填：预设仍是自定义 + 范围还是全量兜底
        if (detected !== null && isUnbounded(current) && get().timePreset === "自定义") {
          set({ timeRange: { ...detected } });
        }
      } catch (err) {
        // 识别失败不打断页面（老数据集 / 无时间列都走这里），下次进页面再试
        set({ detectedFor: datasetId, detectedRange: null, toast: err instanceof Error ? err.message : String(err) });
      }
    },

    openForRule: (rule, dataset) => {
      const { filterRows, metricBoxes } = rowsFromRule(rule, dataset.columns);
      const range = initialTimeRange(dataset);
      forgetComputeSignature();
      set({
        dataset,
        ruleName: rule.name,
        timePreset: "自定义",
        timeRange: range,
        filterRows,
        metricBoxes,
        derivedMetrics: derivedMetricsOf(metricBoxes),
        valueOptions: {},
        valuesSignature: "",
        result: null,
        toast: null,
        loading: false,
        error: null,
      });
      void get().ensureDetectedRange(dataset.id);
    },

    openFree: (dataset) => {
      forgetComputeSignature();
      set({
        dataset,
        ruleName: null,
        timePreset: "自定义",
        timeRange: initialTimeRange(dataset),
        filterRows: [],
        metricBoxes: [],
        derivedMetrics: [],
        valueOptions: {},
        valuesSignature: "",
        result: null,
        toast: null,
        loading: false,
        error: null,
      });
      void get().ensureDetectedRange(dataset.id);
    },

    setTimePreset: (preset) => {
      const { timeRange } = get();
      if (preset === "自定义") {
        set({ timePreset: preset });
        return;
      }
      const range = presetRange(preset);
      useDirtyStore.getState().markDirty();
      set({
        timePreset: preset,
        timeRange: { ...range, field: timeRange?.field ?? TIME_FIELD },
      });
    },

    setTimeRange: (start, end) => {
      useDirtyStore.getState().markDirty();
      set((state) => ({
        timePreset: "自定义",
        timeRange: { start, end, field: state.timeRange?.field ?? TIME_FIELD },
      }));
    },

    addFilterRows: (fields) => {
      const dataset = get().dataset;
      if (dataset === null) return;
      const existing = get().filterRows;
      const room = MAX_FILTER_ROWS - existing.length;
      if (room <= 0) {
        set({ toast: `条件最多 ${MAX_FILTER_ROWS} 条` });
        return;
      }
      const rows = fields.slice(0, room).map((field) => defaultFilterRow(field, dataset.columns));
      useDirtyStore.getState().markDirty();
      set({
        filterRows: [...existing, ...rows],
        toast: fields.length > room ? `已加到上限 ${MAX_FILTER_ROWS} 条` : null,
      });
    },

    updateFilterRow: (id, patch) => {
      useDirtyStore.getState().markDirty();
      set({
        filterRows: get().filterRows.map((row) =>
          row.id === id ? { ...row, ...patch } : row,
        ),
      });
    },

    removeFilterRow: (id) => {
      useDirtyStore.getState().markDirty();
      set({ filterRows: get().filterRows.filter((row) => row.id !== id) });
    },

    moveFilterRow: (id, direction) => {
      const rows = get().filterRows;
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return;
      useDirtyStore.getState().markDirty();
      set({ filterRows: moveEntry(rows, index, index + direction) });
    },

    moveFilterRowTo: (id, targetId) => {
      const rows = get().filterRows;
      const from = rows.findIndex((row) => row.id === id);
      const to = rows.findIndex((row) => row.id === targetId);
      if (from < 0 || to < 0 || from === to) return;
      useDirtyStore.getState().markDirty();
      set({ filterRows: moveEntry(rows, from, to) });
    },

    addMetricBoxes: (fields) => {
      const dataset = get().dataset;
      if (dataset === null || fields.length === 0) return;
      const existing = get().metricBoxes;
      const room = MAX_METRIC_BOXES - existing.length;
      if (room <= 0) {
        set({ toast: `指标最多 ${MAX_METRIC_BOXES} 个` });
        return;
      }
      const boxes = fields
        .slice(0, room)
        .map((field) => defaultMetricBox(field));
      commitBoxes(
        [...existing, ...boxes],
        fields.length > room ? `已加到上限 ${MAX_METRIC_BOXES} 个指标` : "已新增指标",
      );
    },

    addMetricSlots: (boxId, fields) => {
      if (fields.length === 0) return;
      const box = get().metricBoxes.find((item) => item.id === boxId);
      if (box === undefined) return;
      const room = MAX_METRIC_SLOTS - metricSlots(box).length;
      if (room <= 0) {
        set({ toast: `单个指标最多 ${MAX_METRIC_SLOTS} 个字段` });
        return;
      }
      let next = box;
      for (const field of fields.slice(0, room)) next = appendMetricSlot(next, field);
      commitBoxes(
        get().metricBoxes.map((item) => (item.id === boxId ? next : item)),
        `已追加 ${Math.min(fields.length, room)} 个计算字段`,
      );
    },

    updateMetricSlot: (boxId, slotId, patch) => {
      updateBox(boxId, (box) => ({
        ...box,
        tokens: box.tokens.map((token) => {
          if (token.kind !== "slot" || token.slot.id !== slotId) return token;
          const slot = { ...token.slot, ...patch };
          // 换了字段或计算方式，固定规则带来的专属列名就失效了
          if (patch.field !== undefined && patch.field !== token.slot.field) slot.alias = "";
          if (patch.agg !== undefined && patch.agg !== token.slot.agg) slot.alias = "";
          return { ...token, slot };
        }),
      }));
    },

    removeMetricSlot: (boxId, slotId) => {
      updateBox(boxId, (box) => removeMetricSlot(box, slotId));
    },

    removeMetricBox: (boxId) => {
      commitBoxes(get().metricBoxes.filter((box) => box.id !== boxId));
    },

    moveMetricBox: (boxId, direction) => {
      const boxes = get().metricBoxes;
      const index = boxes.findIndex((box) => box.id === boxId);
      if (index < 0) return;
      commitBoxes(moveEntry(boxes, index, index + direction));
    },

    moveMetricBoxTo: (boxId, targetId) => {
      const boxes = get().metricBoxes;
      const from = boxes.findIndex((box) => box.id === boxId);
      const to = boxes.findIndex((box) => box.id === targetId);
      if (from < 0 || to < 0 || from === to) return;
      commitBoxes(moveEntry(boxes, from, to));
    },

    setMetricOp: (boxId, tokenId, choice) => {
      updateBox(boxId, (box) => applyOpChoice(box, tokenId, choice));
    },

    removeMetricParenToken: (boxId, tokenId) => {
      updateBox(boxId, (box) => removeMetricParen(box, tokenId));
    },

    toggleMetricCollapse: (boxId) => {
      set({
        metricBoxes: get().metricBoxes.map((box) =>
          box.id === boxId ? { ...box, collapsed: !box.collapsed } : box,
        ),
      });
    },

    loadValues: async (fields) => {
      const { dataset, timeRange, filterRows, metricBoxes } = get();
      if (dataset === null) return;
      // 只取真正用到的字段：全列取值在 45 列 × 10 万行时非常慢（用户反馈 3）
      const used = fields ?? [...new Set([...filterRows.map((row) => row.field), ...boxFields(metricBoxes)])];
      const targets = used.length > 0 ? used : dataset.columns.slice(0, 8).map((column) => column.name);
      const signature = JSON.stringify([
        dataset.id,
        timeRange?.start ?? "",
        timeRange?.end ?? "",
        timeRange?.field ?? "",
        targets,
      ]);
      if (signature === get().valuesSignature) return;

      const timeRangePayload =
        timeRange === null
          ? null
          : { start: timeRange.start, end: timeRange.end, field: timeRange.field };
      try {
        const values = await fetchValues({
          dataset_id: dataset.id,
          fields: targets,
          limit: 200,
          time_range: timeRangePayload,
        });
        if (get().dataset?.id !== dataset.id) return;
        set({ valueOptions: values, valuesSignature: signature });
      } catch (err) {
        set({ toast: err instanceof Error ? err.message : String(err) });
      }
    },

    setToast: (message) => {
      set({ toast: message });
    },

    clearToast: () => {
      set({ toast: null });
    },

    renameResultColumn: (index, name) => {
      const result = get().result;
      if (result === null || name === "") return;
      const columns = [...result.columns];
      if (index < 0 || index >= columns.length) return;
      columns[index] = name;
      set({ result: { ...result, columns } });
      useDirtyStore.getState().markDirty();
    },

    editResultCell: (rowIndex, columnIndex, value) => {
      const result = get().result;
      if (result === null) return;
      const row = result.rows[rowIndex];
      if (row === undefined) return;
      const original = row[columnIndex];
      const text = value.trim();
      let next: unknown = text;
      if (typeof original === "number" || (text !== "" && !Number.isNaN(Number(text)))) {
        next = text === "" ? null : Number(text);
      }
      const rows = result.rows.map((item, index) =>
        index === rowIndex ? item.map((cell, col) => (col === columnIndex ? next : cell)) : item,
      );
      set({ result: { ...result, rows } });
      useDirtyStore.getState().markDirty();
    },

    compute: async () => {
      const { dataset, timeRange, filterRows, metricBoxes } = get();
      if (!dataset) {
        set({ error: "尚未导入数据集" });
        return;
      }
      if (!timeRange || !timeRange.start || !timeRange.end) {
        set({ error: "请先选择时间范围" });
        return;
      }
      if (!metricBoxes.some((box) => filledSlots(box).length > 0)) {
        set({ error: "请至少添加一个指标" });
        return;
      }
      const config = buildAnalysisConfig(
        dataset.id,
        timeRange,
        filterRows,
        metricBoxes,
        dataset.columns,
      );
      if (config === null) {
        set({ error: "分析配置不完整，无法计算" });
        return;
      }
      set({ loading: true, error: null });
      try {
        const result = await apiCompute(config);
        useDirtyStore.getState().markDirty();
        set({ result, loading: false });
        // 分析配置变了 → X 轴整体忘掉（回到「—」）；没变就只把失效的字段/取值对齐掉。
        // 用户反馈（第六轮 C，方案 A）：改过滤条件重算后 X 轴还留着上次勾的取值。
        const signature = JSON.stringify(config);
        const configChanged = lastComputeSignature !== null && lastComputeSignature !== signature;
        lastComputeSignature = signature;
        if (configChanged) useChartStore.getState().resetXAxis();
        const patch = reconcileChartConfig(result, useChartStore.getState().config);
        if (patch !== null) useChartStore.getState().updateConfig(patch);
      } catch (err) {
        set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      }
    },

    exportTable: async (format) => {
      const { result, dataset } = get();
      if (result === null) return "还没有结果，请先开始计算";
      // 文件名：分析结果_项目名 · 导入的表格名_YYYY-MM-DD HH：MM
      const project = getCurrentProjectRef().name ?? "";
      const table = (dataset?.name ?? "").replace(/\.(xlsx|xls|csv)$/i, "");
      const parts = ["分析结果"];
      if (project !== "" && table !== "") parts.push(`${project} · ${table}`);
      else if (project !== "") parts.push(project);
      else if (table !== "") parts.push(table);
      const filename = `${safeFileName(parts.join("_"))}_${stampMinute()}.${format}`;
      if (isTauri()) {
        const path = await pickSavePath(filename, format);
        if (path === null) return "未选择保存位置";
        await exportTableToPath(result, format, path);
        await useExportStore.getState().record({ path, kind: "file", name: filename });
        return `已导出：${path}`;
      }
      const blob = await exportTableBytes(result, format, filename);
      downloadBlob(blob, filename);
      return `已导出：${filename}`;
    },

    exportChart: async (format) => {
      const { result } = get();
      if (result === null) return "还没有结果，请先开始计算";
      const config = useChartStore.getState().config;
      // 双击改的图例名 / X 轴取值筛选要先落到结果表，后端渲染才认
      const display = applyChartDisplay(result, config);
      const ext = format === "pdf" ? "pdf" : "jpg";
      // 文件名：X 轴取值 · Y 轴指标分析_YYYY-MM-DD HH：MM
      // 多维度组合时 X 轴文字改成「维度1×维度2（N 项）」，否则用第一个维度勾选的取值
      const dims = xDimsOf(config);
      const firstDim = dims[0];
      const xValues = (firstDim?.values ?? []).filter((value) => value.trim() !== "");
      const xText =
        dims.length > 1
          ? `${dims.map((dim) => dim.field).join("×")}${
              xDimPickedCount(config) > 0 ? `（${xDimPickedCount(config)}项）` : ""
            }`
          : xValues.length === 0
            ? (config.x_axis ?? "")
            : `${xValues.slice(0, 6).join("、")}${
                xValues.length > 6 ? `等${xValues.length}项` : ""
              }`;
      const yText = (config.show_fields[0] ?? config.y_axis ?? "").trim();
      const head = [xText, yText === "" ? "图表分析" : `${yText}分析`]
        .filter((part) => part.trim() !== "")
        .join(" · ");
      const filename = `${safeFileName(head)}_${stampMinute()}.${ext}`;
      if (isTauri()) {
        // 与表格导出一样：先弹保存框，再让后端写到该路径
        const path = await pickSavePath(filename, ext);
        if (path === null) return "未选择保存位置";
        const saved = await renderChartToPath(display.result, display.config, format, path);
        await useExportStore.getState().record({ path: saved, kind: "file", name: filename });
        return `已导出：${saved}`;
      }
      const blob = await renderChart(display.result, display.config, format);
      downloadBlob(blob, filename);
      return `已导出图表：${filename}`;
    },

    restore: (config, dataset, ruleName, result) => {
      const { filterRows, metricBoxes } = rowsFromConfig(config, dataset.columns);
      set({
        dataset,
        ruleName: ruleName ?? null,
        // 默认预设 = 自定义（第 11 轮 C：不再默认「本月」）
        timePreset: "自定义",
        timeRange:
          config === null
            ? initialTimeRange(dataset)
            : (config.time_range ?? initialTimeRange(dataset)),
        filterRows,
        metricBoxes,
        derivedMetrics: derivedMetricsOf(metricBoxes),
        valueOptions: {},
        valuesSignature: "",
        result: result ?? null,
        toast: null,
        loading: false,
        error: null,
      });
      // 快照里没存时间范围（还是全量）时，用识别出来的范围补上
      void get().ensureDetectedRange(dataset.id);
    },

    buildConfig: () => {
      const { dataset, timeRange, filterRows, metricBoxes } = get();
      if (!dataset) return null;
      return buildAnalysisConfig(
        dataset.id,
        timeRange,
        filterRows,
        metricBoxes,
        dataset.columns,
      );
    },

    restoreRows: (payload) => {
      // 新快照存 metricBoxes；旧快照只有 metricRows（按 AND 切成指标框）
      const metricBoxes =
        payload.metricBoxes !== undefined && payload.metricBoxes.length > 0
          ? payload.metricBoxes
          : boxesFromLegacyRows(payload.metricRows ?? []);
      const current = get().timeRange;
      const start = payload.start ?? current?.start ?? "";
      const end = payload.end ?? current?.end ?? "";
      forgetComputeSignature();
      set({
        filterRows: payload.filterRows,
        metricBoxes,
        derivedMetrics: derivedMetricsOf(metricBoxes),
        timePreset: payload.timePreset ?? get().timePreset,
        timeRange:
          start !== "" && end !== ""
            ? { start, end, field: current?.field ?? TIME_FIELD }
            : current,
      });
    },

    reset: () => {
      forgetComputeSignature();
      set({
        dataset: null,
        ruleName: null,
        timePreset: "自定义",
        timeRange: null,
        filterRows: [],
        metricBoxes: [],
        derivedMetrics: [],
        valueOptions: {},
        valuesSignature: "",
        result: null,
        loading: false,
        error: null,
        toast: null,
        detectedRange: null,
        detectedFor: null,
      });
    },
  };
});

/** 让界面能生成稳定的空行 id（新增条件时用）。 */
export function newRowId(prefix: "f" | "m" | "b" | "s" | "t"): string {
  return nextRowId(prefix);
}
