import type {
  ChartAggregation,
  ChartConfig,
  ChartType,
  ChartXDim,
  ComputeResult,
  SortOrder,
  TimeGranularity,
} from "../types/api";

// 判断某列是否数值（取第一个非空值）
export function isNumericColumn(result: ComputeResult, column: string): boolean {
  const index = result.columns.indexOf(column);
  if (index < 0) return false;
  for (const row of result.rows) {
    const value = row[index];
    if (value !== null && value !== undefined && value !== "") {
      return typeof value === "number";
    }
  }
  return false;
}

// 时间粒度分桶：day/month/quarter/year；未知/非法日期返回 null
export function bucketDate(value: string, granularity: TimeGranularity): string | null {
  if (value === "" || value === "未知日期") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (granularity === "day") return `${year}-${pad(month)}-${pad(day)}`;
  if (granularity === "month") return `${year}-${pad(month)}`;
  if (granularity === "quarter") return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  return `${year}`;
}

/* ────────────────────────── X 轴多维度组合 ────────────────────────── */

/** 组合标签的分隔符（用户 2026-10-28 定稿：两边带空格，`金华婺城 · 浙江省 · 0-60`）。 */
export const X_DIM_SEPARATOR = " · ";

/** 烘焙成结果表列名时的分隔符（列名里不留空格，导出的表头更好看）。 */
const X_DIM_NAME_SEPARATOR = "·";

/** 结果表里一个可作 X 轴的维度列 + 它勾选的取值。 */
export interface XDimColumn {
  field: string;
  index: number;
  /** undefined = 不筛（该维度全部取值）；[] = 一条都不留 */
  values?: string[];
}

/**
 * X 轴叠加的维度：优先用 ``x_dims``；没有就按老的 ``x_axis`` + ``x_values`` 兜底。
 *
 * 老项目快照里只有单字段配置，这里统一升成「一个维度的数组」，
 * 后面所有逻辑只认这一种形状，不会再出现两套分支。
 */
export function xDimsOf(config: ChartConfig): ChartXDim[] {
  const dims = (config.x_dims ?? []).filter((dim) => dim.field.trim() !== "");
  if (dims.length > 0) return dims;
  if (config.x_axis === null) return [];
  // 老配置：x_values 缺省 = 全部；空数组 = 取消全选（一条都不留）
  return [{ field: config.x_axis, values: config.x_values }];
}

/** 维度字段（按添加顺序），给标题/文件名/校验用。 */
export function xDimFields(config: ChartConfig): string[] {
  return xDimsOf(config).map((dim) => dim.field);
}

/** 是否多个维度组合（>= 2 才需要拼标签 + 烘焙成列）。 */
export function isCombinedXAxis(config: ChartConfig): boolean {
  return xDimsOf(config).length > 1;
}

/** 把维度映射到结果表列下标；结果表里没有的维度直接丢掉（换筛选条件后自愈）。 */
export function xDimColumns(result: ComputeResult, dims: ChartXDim[]): XDimColumn[] {
  const columns: XDimColumn[] = [];
  for (const dim of dims) {
    const index = result.columns.indexOf(dim.field);
    if (index < 0) continue;
    columns.push({ field: dim.field, index, values: dim.values });
  }
  return columns;
}

/** 把每一维勾选的取值转成 Set（用于逐行过滤）；null = 该维度不筛（老配置）。 */
export function xDimAllowedSets(columns: XDimColumn[]): (Set<string> | null)[] {
  return columns.map((column) =>
    column.values === undefined ? null : new Set(column.values),
  );
}

/**
 * 一行是否通过所有维度的取值筛选。
 *
 * `values === undefined` = 老配置（没有取值列表）= 不筛；
 * 新界面添加维度时一律写 `values: []`（不选 = 该维度没有值进入筛选）。
 */
export function rowPassesXDims(
  row: unknown[],
  columns: XDimColumn[],
  allowed: (Set<string> | null)[] = xDimAllowedSets(columns),
): boolean {
  return columns.every((column, index) => {
    const set = allowed[index];
    return set === null || set === undefined || set.has(String(row[column.index] ?? ""));
  });
}

/** 一行各维度取值拼成的组合标签。 */
export function combinedXLabel(values: unknown[]): string {
  return values.map((value) => String(value ?? "")).join(X_DIM_SEPARATOR);
}

/** 一行在组合 X 轴上的标签（单维度 = 原值，多维度 = 值1·值2…）。 */
export function xLabelOf(row: unknown[], columns: XDimColumn[]): string {
  if (columns.length === 0) return "";
  if (columns.length === 1) return String(row[columns[0].index] ?? "");
  return combinedXLabel(columns.map((column) => row[column.index]));
}

/** 「已选 N 项」里的 N：所有维度勾选取值数之和。 */
export function xDimPickedCount(config: ChartConfig): number {
  return xDimsOf(config).reduce((total, dim) => total + (dim.values?.length ?? 0), 0);
}

/** X 轴按钮上的摘要：``字段1 × 字段2 · 已选 N 项 / 全部``（原型 #chart-x-label 的文案）。 */
export function xDimSummary(config: ChartConfig): string {
  const fields = xDimFields(config);
  if (fields.length === 0) return "—";
  const picked = xDimPickedCount(config);
  return `${fields.join(" × ")}${picked > 0 ? ` · 已选 ${picked} 项` : " · 全部"}`;
}

/** 组合 X 轴在结果表里那一列的列名（烘焙用）。 */
export function combinedXColumnName(
  dims: ChartXDim[],
  aliases: Record<string, string> = {},
): string {
  return dims.map((dim) => aliases[dim.field] ?? dim.field).join(X_DIM_NAME_SEPARATOR);
}

/* ───────────────────── X 轴标签折行（前后端同一套规则） ───────────────────── */

/** 刻度标签每行最多多少字。 */
export const LABEL_LINE_CHARS = 9;
/** 刻度标签最多几行（超出用 … 截断）。 */
export const LABEL_MAX_LINES = 3;

/**
 * 组合刻度过长时折成多行（预览与导出共用同一套规则，保证一模一样）。
 *
 * 优先在「 · 」处断行；单个取值本身太长就按字符硬切；超过 ``maxLines`` 行用 … 收尾。
 */
export function wrapCategoryLabel(
  label: string,
  charsPerLine: number = LABEL_LINE_CHARS,
  maxLines: number = LABEL_MAX_LINES,
): string {
  if (label.length <= charsPerLine) return label;
  const lines: string[] = [];
  let line = "";
  const flush = (): void => {
    if (line !== "") {
      lines.push(line);
      line = "";
    }
  };
  for (const part of label.split(X_DIM_SEPARATOR)) {
    const candidate = line === "" ? part : `${line}${X_DIM_SEPARATOR}${part}`;
    if (candidate.length <= charsPerLine) {
      line = candidate;
      continue;
    }
    flush();
    let rest = part;
    while (rest.length > charsPerLine) {
      lines.push(rest.slice(0, charsPerLine));
      rest = rest.slice(charsPerLine);
    }
    line = rest;
  }
  flush();
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, Math.max(1, charsPerLine - 1))}…`;
    return kept.join("\n");
  }
  return lines.join("\n");
}

export interface FittedAxisLabels {
  labels: string[];
  fontSize: number;
  rotate: number;
  /** ECharts 的 interval 语义：每 (interval + 1) 个刻度显示一个（0 = 全部显示）。 */
  interval: number;
}

/**
 * 旋转后的文字在水平方向占多宽（外接盒宽度，px）。
 *
 * 用户 2026-10-28 反馈：组合刻度三行斜排时会互相压住。重叠的真正判据不是「每个刻度多少 px」，
 * 而是「标签旋转后外接盒的宽度」是否小于刻度间距。
 */
export function labelFootprint(
  lineChars: number,
  lines: number,
  fontSize: number,
  rotate: number,
): number {
  const rad = (rotate * Math.PI) / 180;
  const width = lineChars * fontSize * 0.95;
  const height = lines * (fontSize + 3);
  return Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad)) + 4;
}

/** 折行之后最宽一行几个字、一共几行（用来算外接盒）。 */
function _wrappedShape(
  labels: string[],
  charsPerLine: number,
  maxLines: number,
): { chars: number; lines: number } {
  let chars = 1;
  let lines = 1;
  for (const label of labels) {
    const rows = wrapCategoryLabel(label, charsPerLine, maxLines).split("\n");
    lines = Math.max(lines, rows.length);
    for (const row of rows) chars = Math.max(chars, row.length);
  }
  return { chars, lines };
}

/**
 * 按「每个刻度可用的宽度」自适应字号 / 斜度 / 每行字数 / 隔几个显示（用户 2026-10-28 反馈 4）。
 *
 * 预览（ECharts）和导出（matplotlib）共用同一套阈值，只是单位不同（px / pt），
 * 保证两边「挤不下就缩字号、再挤就折行、再挤加斜度、实在不行隔几个显示一个」完全一致。
 */
export function fitAxisLabels(labels: string[], perCategory: number): FittedAxisLabels {
  const slot = Math.max(8, perCategory);
  const size = Math.min(11, Math.max(7.5, slot / 5.5));
  const fontSize = Math.round(size * 10) / 10;
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 1);
  const wrapAll = (charsPerLine: number, maxLines: number): string[] =>
    labels.map((label) => wrapCategoryLabel(label, charsPerLine, maxLines));

  // ① 先找能塞进一格、又不重叠的方案：角度从小到大、行数从少到多
  for (const rotate of [0, 30, 45, 60]) {
    for (const maxLines of [1, 2, 3]) {
      const charsPerLine = Math.max(3, Math.ceil(longest / maxLines));
      const shape = _wrappedShape(labels, charsPerLine, maxLines);
      if (labelFootprint(shape.chars, shape.lines, fontSize, rotate) <= slot) {
        return { labels: wrapAll(charsPerLine, maxLines), fontSize, rotate, interval: 0 };
      }
    }
  }

  // ② 斜排也塞不下：竖排（90°、固定 3 行，横向只占一个行高），刻度全显示。
  //    用户 2026-10-28 反馈：三行斜排会互相压住，竖排反而全看得见、也不重叠。
  const verticalChars = Math.max(3, Math.ceil(longest / 3));
  const verticalShape = _wrappedShape(labels, verticalChars, 3);
  if (labelFootprint(verticalShape.chars, verticalShape.lines, fontSize, 90) <= slot) {
    return { labels: wrapAll(verticalChars, 3), fontSize, rotate: 90, interval: 0 };
  }

  // ③ 连竖排都放不开：45° + 3 行，按外接盒算「隔几个显示一个」
  const charsPerLine = Math.max(3, Math.ceil(longest / 3));
  const shape = _wrappedShape(labels, charsPerLine, 3);
  const footprint = labelFootprint(shape.chars, shape.lines, fontSize, 45);
  return {
    labels: wrapAll(charsPerLine, 3),
    fontSize,
    rotate: 45,
    interval: Math.max(0, Math.ceil(footprint / slot) - 1),
  };
}

/** 图表标题：config.title 为空时用「维度 × 指标」自动生成（预览与导出共用）。 */
export function autoChartTitle(config: ChartConfig): string {
  const dims = xDimFields(config);
  const x = dims.length > 0 ? dims.join(" × ") : "分组";
  const alias = config.label_aliases ?? {};
  const fields = config.show_fields.filter((field) => field.trim() !== "");
  const y =
    fields.length > 0
      ? fields.map((field) => alias[field] ?? field).join(" / ")
      : (config.y_axis === null ? "数值" : (alias[config.y_axis] ?? config.y_axis));
  return `${x} × ${y}`;
}

/** 组一个新设置的补丁：x_axis / x_values 始终与第一个维度保持一致（老逻辑继续可用）。 */
export function withXDims(dims: ChartXDim[]): Partial<ChartConfig> {
  const first = dims[0];
  return {
    x_dims: dims,
    x_axis: first === undefined ? null : first.field,
    x_values: first === undefined ? undefined : first.values,
  };
}

/* ────────────────────── 项目快照读回（老配置兼容） ────────────────────── */

/** 可读回的图表类型：散点图已于 2026-10-30（第 14 轮）下线（老快照见 normalizeChartConfig）。 */
const CHART_TYPES: readonly ChartType[] = ["line", "bar", "column", "pie"];
const SORT_BY: readonly ChartConfig["sort_by"][] = ["x", "y", "custom"];
const SORT_ORDER: readonly ChartConfig["sort_order"][] = ["asc", "desc"];
const GRANULARITY: readonly TimeGranularity[] = ["day", "month", "quarter", "year"];
const AGGREGATIONS: readonly ChartAggregation[] = ["sum", "avg", "max", "min", "first", "last"];

function _enumOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function _stringOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function _stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function _xDimsOfRaw(value: unknown): ChartXDim[] {
  if (!Array.isArray(value)) return [];
  const dims: ChartXDim[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const field = typeof record.field === "string" ? record.field : "";
    if (field.trim() === "" || seen.has(field)) continue;
    seen.add(field);
    dims.push({
      field,
      values: Array.isArray(record.values) ? _stringsOf(record.values) : undefined,
    });
  }
  return dims;
}

/* ────────────────────── 重新计算后把图表配置对齐结果表 ────────────────────── */

function _sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * 重新计算后把图表配置对齐到新的结果表（2026-10-28 用户反馈 1）。
 *
 * - 维度字段已经不在结果表里（筛选条件改了）→ 删掉这个维度；
 * - 维度勾选的取值在新结果里不存在 → 丢掉；一个都不剩 = 这个字段不再是 X 轴维度
 *   （2026-10-28 第六轮：界面语义改成「勾取值才算上轴」，空取值列表会让图表变空，
 *   和界面上「没上轴」的显示对不上，这里直接连维度一起删）；
 * - Y 指标字段不存在 → 丢掉，`y_axis` 跟着换到还存在的数值列；
 * 没有任何变化返回 null（不白写 store）。
 */
export function reconcileChartConfig(
  result: ComputeResult,
  config: ChartConfig,
): Partial<ChartConfig> | null {
  const dims = xDimsOf(config);
  const nextDims: ChartXDim[] = [];
  for (const dim of dims) {
    const index = result.columns.indexOf(dim.field);
    if (index < 0) continue;
    if (dim.values === undefined) {
      // 老配置（没有取值列表）= 不筛，保持原样
      nextDims.push(dim);
      continue;
    }
    const allowed = new Set<string>();
    for (const row of result.rows) allowed.add(String(row[index] ?? ""));
    const kept = dim.values.filter((value) => allowed.has(value));
    if (kept.length === 0) continue;
    nextDims.push({ field: dim.field, values: kept });
  }

  const yFields = config.show_fields.filter(
    (field) => result.columns.includes(field) && isNumericColumn(result, field),
  );
  const yCandidates = result.columns.filter((column) => isNumericColumn(result, column));
  const yAxis =
    config.y_axis !== null && result.columns.includes(config.y_axis)
      ? config.y_axis
      : (yFields[0] ?? yCandidates[0] ?? null);
  const series =
    config.series !== null && result.columns.includes(config.series) ? config.series : null;

  const patch: Partial<ChartConfig> = {
    ...withXDims(nextDims),
    show_fields: yFields,
    y_axis: yAxis,
    series,
  };

  const unchanged =
    _sameValue(config.x_dims, patch.x_dims) &&
    _sameValue(config.x_axis, patch.x_axis) &&
    _sameValue(config.x_values, patch.x_values) &&
    _sameValue(config.show_fields, patch.show_fields) &&
    _sameValue(config.y_axis, patch.y_axis) &&
    _sameValue(config.series, patch.series);
  return unchanged ? null : patch;
}

/**
 * 读回项目快照里的图表配置：老的单字段配置自动升成 ``x_dims``，脏字段直接丢掉。
 *
 * 老项目里只有 ``x_axis`` + ``x_values``（没有 ``x_dims``），这里补一个维度，
 * 界面照常显示「一级：字段 / 二级：取值」，不会把旧项目读崩。
 */
export function normalizeChartConfig(raw: unknown): Partial<ChartConfig> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const patch: Partial<ChartConfig> = {};

  const chartType = _enumOf(source.chart_type, CHART_TYPES);
  if (chartType !== null) {
    patch.chart_type = chartType;
  } else if (source.chart_type === "scatter") {
    // 散点图已下线：老项目里的散点配置按折线读回，图表不至于空白
    patch.chart_type = "line";
  }
  const yAxis = _stringOf(source.y_axis);
  if ("y_axis" in source) patch.y_axis = yAxis;
  if ("x_axis" in source) patch.x_axis = _stringOf(source.x_axis);
  const series = _stringOf(source.series);
  if ("series" in source) patch.series = series;
  if ("show_fields" in source) patch.show_fields = _stringsOf(source.show_fields);
  const sortBy = _enumOf(source.sort_by, SORT_BY);
  if (sortBy !== null) patch.sort_by = sortBy;
  const sortOrder = _enumOf(source.sort_order, SORT_ORDER);
  if (sortOrder !== null) patch.sort_order = sortOrder;
  if ("top_n" in source) {
    const topN = source.top_n;
    patch.top_n = typeof topN === "number" && Number.isFinite(topN) && topN > 0 ? topN : null;
  }
  if (typeof source.palette === "string" && source.palette.trim() !== "") {
    patch.palette = source.palette;
  }
  if ("title" in source) patch.title = typeof source.title === "string" ? source.title : "";
  if (typeof source.show_legend === "boolean") patch.show_legend = source.show_legend;
  if (typeof source.show_data_labels === "boolean") {
    patch.show_data_labels = source.show_data_labels;
  }
  if ("time_granularity" in source) {
    patch.time_granularity = _enumOf(source.time_granularity, GRANULARITY);
  }
  const aggregation = _enumOf(source.aggregation, AGGREGATIONS);
  if (aggregation !== null) patch.aggregation = aggregation;

  const aliasesRaw = source.label_aliases;
  if (typeof aliasesRaw === "object" && aliasesRaw !== null && !Array.isArray(aliasesRaw)) {
    const aliases: Record<string, string> = {};
    for (const [key, value] of Object.entries(aliasesRaw as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim() !== "") aliases[key] = value;
    }
    patch.label_aliases = aliases;
  }

  // x_dims 优先；没有就把老的 x_axis + x_values 升成一个维度
  const dims = _xDimsOfRaw(source.x_dims);
  const legacyValues = Array.isArray(source.x_values) ? _stringsOf(source.x_values) : undefined;
  const legacyDim: ChartXDim | null =
    patch.x_axis !== undefined && patch.x_axis !== null
      ? { field: patch.x_axis, values: legacyValues }
      : null;
  const nextDims = dims.length > 0 ? dims : legacyDim === null ? [] : [legacyDim];
  patch.x_dims = nextDims;
  if (nextDims.length > 0) {
    patch.x_axis = nextDims[0].field;
    patch.x_values = nextDims[0].values;
  } else {
    patch.x_axis = null;
    patch.x_values = undefined;
  }

  return patch;
}

/* ─────────────────────────── 校验 / 类型清理 ─────────────────────────── */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// 校验字段映射合法性（nonSumColumns = 派生/占比列的别名）
export function validateChartConfig(
  config: ChartConfig,
  result: ComputeResult,
  nonSumColumns: string[] = [],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nonSum = new Set(nonSumColumns);

  if (config.x_axis === null) errors.push("请选择 X 轴字段");
  if (config.y_axis === null) errors.push("请选择 Y 轴字段");

  if (config.chart_type === "pie") {
    if (config.series !== null) errors.push("饼图不支持系列字段");
    if (config.y_axis !== null && isNumericColumn(result, config.y_axis)) {
      const values = _numericValues(result, config.y_axis);
      const dropped = values.filter((value) => value <= 0).length;
      if (dropped > 0) warnings.push(`饼图已过滤 ${dropped} 条负数/零值数据`);
      if (values.length - dropped === 0) errors.push("饼图没有可用的正数值数据");
    }
  } else {
    if (config.y_axis !== null && !isNumericColumn(result, config.y_axis)) {
      errors.push(`${_typeLabel(config.chart_type)}图要求 Y 轴是数值列`);
    }
    if (
      (config.chart_type === "bar" || config.chart_type === "column") &&
      _categoryCount(result, config) > 50
    ) {
      errors.push("柱状图类别数不能超过 50");
    }
  }

  if (config.time_granularity !== null) {
    if (config.y_axis !== null && nonSum.has(config.y_axis)) {
      errors.push("时间粒度重汇总仅支持原始聚合指标（派生/占比列请关闭时间粒度）");
    }
    if (config.series !== null && nonSum.has(config.series)) {
      errors.push("时间粒度重汇总仅支持原始聚合指标");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export interface SanitizeResult {
  config: ChartConfig;
  cleared: string[];
}

// 切换图表类型时清理不适用的字段映射
export function sanitizeConfigForType(config: ChartConfig, type: ChartType): SanitizeResult {
  const patch: Partial<ChartConfig> = { chart_type: type };
  const cleared: string[] = [];

  if (type === "pie") {
    if (config.series !== null) {
      patch.series = null;
      cleared.push("series");
    }
  }

  return { config: { ...config, ...patch }, cleared };
}

/* ─────────────────────── 导出前把显示层烘焙进结果表 ─────────────────────── */

/** X 轴取值筛选 + 图例改名 + 多维度组合：导出前把「只改了显示」的配置落到结果表上。
 *
 * 后端图表渲染只认结果表列名，所以：
 * - 双击改的图例名要先改列名；
 * - 各维度勾选的取值要先筛行；
 * - 多维度组合要先拼成真正的一列（否则 matplotlib 认不出来）。
 */
export function applyChartDisplay(
  result: ComputeResult,
  config: ChartConfig,
): { result: ComputeResult; config: ChartConfig } {
  const dims = xDimsOf(config);
  const dimColumns = xDimColumns(result, dims);
  const aliases = config.label_aliases ?? {};
  const allowed = xDimAllowedSets(dimColumns);
  const rows =
    dimColumns.length === 0
      ? result.rows
      : result.rows.filter((row) => rowPassesXDims(row, dimColumns, allowed));

  const renamedColumns = result.columns.map((column) => aliases[column] ?? column);
  const rename = (name: string | null): string | null =>
    name === null ? null : (aliases[name] ?? name);
  // 标题为空时补上和预览一模一样的自动标题（导出才能体现标题）
  const title = config.title.trim() === "" ? autoChartTitle(config) : config.title;

  if (dimColumns.length > 1) {
    const columnName = _uniqueColumnName(combinedXColumnName(dims, aliases), renamedColumns);
    const labels = rows.map((row) => xLabelOf(row, dimColumns));
    // 行顺序按预览里的顺序排好，并把排序改成 custom：后端渲染时不再重排，
    // 保证「预览看到什么，导出就是什么」（含 Top N 取到的项）。
    const order = _categoryRowOrder(rows, labels, config, result, dimColumns);
    const orderedRows = order.map((index) => rows[index]);
    const orderedLabels = order.map((index) => labels[index]);
    const baked: ComputeResult = {
      ...result,
      columns: [...renamedColumns, columnName],
      rows: orderedRows.map((row, index) => [...row, orderedLabels[index]]),
      row_count: orderedRows.length,
    };
    return {
      result: baked,
      config: {
        ...config,
        // 组合列已经烘焙成真列，x_dims 清空（配置与结果表保持一致）
        x_axis: columnName,
        x_dims: [],
        x_values: undefined,
        sort_by: "custom",
        title,
        y_axis: rename(config.y_axis),
        series: rename(config.series),
        show_fields: config.show_fields.map((field) => aliases[field] ?? field),
      },
    };
  }

  return {
    result: {
      ...result,
      columns: renamedColumns,
      rows,
      row_count: rows.length,
    },
    config: {
      ...config,
      x_axis: rename(config.x_axis),
      title,
      y_axis: rename(config.y_axis),
      series: rename(config.series),
      show_fields: config.show_fields.map((field) => aliases[field] ?? field),
    },
  };
}

/** 多维度烘焙时决定行顺序：与预览的排序规则一致（x = 维度取值顺序 / y = 指标合计）。 */
function _categoryRowOrder(
  rows: unknown[][],
  labels: string[],
  config: ChartConfig,
  result: ComputeResult,
  dimColumns: XDimColumn[],
): number[] {
  const yIndexes = _yIndexesOf(result, config);
  const shaped: _Row[] = rows.map((row, index) => ({
    x: labels[index],
    y: yIndexes.reduce<number>(
      (acc, column) =>
        acc + (typeof row[column] === "number" ? (row[column] as number) : 0),
      0,
    ),
    series: "",
    key: dimColumns.map((column) => String(row[column.index] ?? "")),
  }));
  const categories = _orderCategories(shaped, config, true, dimColumns);
  const rank = new Map(categories.map((category, index) => [category, index]));
  return rows
    .map((_, index) => index)
    .sort((left, right) => (rank.get(labels[left]) ?? 0) - (rank.get(labels[right]) ?? 0));
}

/** 烘焙时用的 Y 指标：与 prepareChartData 的取舍保持一致（多指标取全部，否则取 y_axis）。 */
function _yIndexesOf(result: ComputeResult, config: ChartConfig): number[] {
  const fields = config.show_fields.filter((field) => result.columns.includes(field));
  const targets = fields.length > 1 ? fields : config.y_axis === null ? [] : [config.y_axis];
  return targets
    .map((field) => result.columns.indexOf(field))
    .filter((index) => index >= 0);
}

function _uniqueColumnName(base: string, columns: string[]): string {
  if (!columns.includes(base)) return base;
  let index = 2;
  while (columns.includes(`${base}（${index}）`)) index += 1;
  return `${base}（${index}）`;
}

/* ─────────────────────────── ECharts 数据准备 ─────────────────────────── */

export interface ChartSeriesData {
  name: string;
  data: (number | null)[];
}

export interface ChartData {
  categories: string[];
  series: ChartSeriesData[];
}

interface _Row {
  x: string;
  y: number | null;
  series: string;
  /** 多维度组合时每个维度的取值（排序用；单维度为 undefined） */
  key?: string[];
}

// 从 ComputeResult 准备 ECharts 数据（含时间粒度重汇总、排序、TopN、饼图过滤）
export function prepareChartData(result: ComputeResult, config: ChartConfig): ChartData {
  // Y 指标勾了多个时按多系列画（原型「Y 指标」chips）；否则沿用单 Y + 系列字段
  const yFields = config.show_fields.filter((field) => result.columns.includes(field));
  if (yFields.length > 1) {
    return _prepareMultiSeries(result, config, yFields);
  }

  const dimColumns = xDimColumns(result, xDimsOf(config));
  const combined = dimColumns.length > 1;
  const yIndex = config.y_axis !== null ? result.columns.indexOf(config.y_axis) : -1;
  const seriesIndex = config.series !== null ? result.columns.indexOf(config.series) : -1;
  const allowed = xDimAllowedSets(dimColumns);
  let rows: _Row[] = result.rows
    .filter((row) => rowPassesXDims(row, dimColumns, allowed))
    .map((row) => {
    const yRaw = yIndex >= 0 ? row[yIndex] : null;
    const key = combined
      ? dimColumns.map((column) => String(row[column.index] ?? ""))
      : undefined;
    return {
      x: xLabelOf(row, dimColumns),
      y: typeof yRaw === "number" ? yRaw : null,
      series: seriesIndex >= 0 ? String(row[seriesIndex] ?? "") : "",
      key,
    };
  });

  // 组合标签不是日期，重汇总没有意义：多维度时跳过时间粒度（保持原样）
  if (config.time_granularity !== null && !combined) {
    rows = _aggregateByTime(rows, config.time_granularity, config.aggregation);
  }

  if (config.chart_type === "pie") {
    rows = rows.filter((row) => row.y !== null && row.y > 0);
  }

  // 没有系列字段时，系列名用 Y 轴指标名（别再显示「数值」，导出/预览才一致）
  const seriesNames =
    seriesIndex >= 0 ? [...new Set(rows.map((row) => row.series))] : [""];

  let categories = _orderCategories(rows, config, combined, dimColumns);

  if (config.top_n !== null && config.top_n > 0) {
    categories = categories.slice(0, config.top_n);
  }

  const series = seriesNames.map((name) => ({
    name: name === "" ? (config.y_axis ?? "数值") : name,
    data: categories.map((category) => {
      const found = rows.find((row) => row.x === category && row.series === name);
      return found ? found.y : null;
    }),
  }));

  return { categories, series };
}

/** 分类排序：多维度组合按「各维度取值顺序」排（= 笛卡尔积顺序），单维度沿用字符串序。 */
function _orderCategories(
  rows: _Row[],
  config: ChartConfig,
  combined: boolean,
  dimColumns: XDimColumn[],
): string[] {
  let categories = [...new Set(rows.map((row) => row.x))];

  if (config.sort_by === "y") {
    categories.sort((a, b) => {
      const diff = _sumByCategory(rows, a) - _sumByCategory(rows, b);
      return config.sort_order === "asc" ? diff : -diff;
    });
    return categories;
  }

  if (combined) {
    return _orderCombinedCategories(rows, categories, dimColumns, config.sort_order);
  }

  if (config.sort_by === "x") {
    categories.sort((a, b) =>
      config.sort_order === "asc" ? a.localeCompare(b) : b.localeCompare(a),
    );
  }
  return categories;
}

/** 组合分类顺序：先比第一个维度的取值顺序，再比第二个……（desc 整体反过来）。 */
function _orderCombinedCategories(
  rows: _Row[],
  categories: string[],
  dimColumns: XDimColumn[],
  order: SortOrder,
): string[] {
  const ranks = dimColumns.map((column, dimIndex) => {
    const map = new Map<string, number>();
    column.values?.forEach((value, index) => map.set(value, index));
    for (const row of rows) {
      const value = (row.key ?? [])[dimIndex] ?? "";
      if (!map.has(value)) map.set(value, map.size);
    }
    return map;
  });

  const keys = new Map<string, string[]>();
  for (const row of rows) {
    if (row.key !== undefined) keys.set(row.x, row.key);
  }

  const sorted = [...categories].sort((a, b) => {
    const left = keys.get(a) ?? [];
    const right = keys.get(b) ?? [];
    for (let index = 0; index < dimColumns.length; index += 1) {
      const lv = ranks[index]?.get(left[index] ?? "") ?? 0;
      const rv = ranks[index]?.get(right[index] ?? "") ?? 0;
      if (lv !== rv) return lv - rv;
    }
    return a.localeCompare(b);
  });
  return order === "desc" ? sorted.reverse() : sorted;
}

function _aggregateByTime(
  rows: _Row[],
  granularity: TimeGranularity,
  aggregation: ChartAggregation,
): _Row[] {
  const buckets = new Map<string, _Row[]>();
  for (const row of rows) {
    const bucket = bucketDate(row.x, granularity);
    if (bucket === null) continue;
    const list = buckets.get(bucket) ?? [];
    list.push(row);
    buckets.set(bucket, list);
  }

  const result: _Row[] = [];
  for (const [bucket, group] of buckets) {
    const bySeries = new Map<string, _Row[]>();
    for (const row of group) {
      const list = bySeries.get(row.series) ?? [];
      list.push(row);
      bySeries.set(row.series, list);
    }
    for (const [seriesName, seriesRows] of bySeries) {
      result.push({
        x: bucket,
        y: _aggregateValues(seriesRows.map((row) => row.y), aggregation),
        series: seriesName,
      });
    }
  }
  return result;
}

interface _MultiSeriesRow {
  x: string;
  values: (number | null)[];
  key?: string[];
}

/** Y 指标勾选多个时：每个指标一个系列，X 轴共用结果表的维度列（可多维度组合）。 */
function _prepareMultiSeries(
  result: ComputeResult,
  config: ChartConfig,
  yFields: string[],
): ChartData {
  const dimColumns = xDimColumns(result, xDimsOf(config));
  const combined = dimColumns.length > 1;
  const yIndexes = yFields.map((field) => result.columns.indexOf(field));
  if (dimColumns.length === 0) return { categories: [], series: [] };

  const allowed = xDimAllowedSets(dimColumns);
  let rows: _MultiSeriesRow[] = result.rows
    .filter((row) => rowPassesXDims(row, dimColumns, allowed))
    .map((row) => ({
    x: xLabelOf(row, dimColumns),
    values: yIndexes.map((index) =>
      typeof row[index] === "number" ? (row[index] as number) : null,
    ),
    key: combined ? dimColumns.map((column) => String(row[column.index] ?? "")) : undefined,
  }));

  if (config.time_granularity !== null && !combined) {
    const buckets = new Map<string, _MultiSeriesRow[]>();
    for (const row of rows) {
      const bucket = bucketDate(row.x, config.time_granularity);
      if (bucket === null) continue;
      const list = buckets.get(bucket) ?? [];
      list.push({ x: bucket, values: row.values });
      buckets.set(bucket, list);
    }
    rows = [...buckets.entries()].map(([bucket, group]) => ({
      x: bucket,
      values: yFields.map((_, column) =>
        _aggregateValues(
          group.map((item) => item.values[column]),
          config.aggregation,
        ),
      ),
    }));
  }

  const rowTotal = (values: (number | null)[]): number =>
    values.reduce<number>((acc, value) => acc + (value ?? 0), 0);

  let categories = [...new Set(rows.map((row) => row.x))];
  if (config.sort_by === "x" && combined) {
    const shaped: _Row[] = rows.map((row) => ({
      x: row.x,
      y: rowTotal(row.values),
      series: "",
      key: row.key,
    }));
    categories = _orderCombinedCategories(
      shaped,
      categories,
      dimColumns,
      config.sort_order,
    );
  } else if (config.sort_by === "x") {
    categories.sort((a, b) =>
      config.sort_order === "asc" ? a.localeCompare(b) : b.localeCompare(a),
    );
  } else if (config.sort_by === "y") {
    const totalOf = (category: string): number =>
      rows
        .filter((row) => row.x === category)
        .reduce<number>((acc, row) => acc + rowTotal(row.values), 0);
    categories.sort((a, b) => {
      const diff = totalOf(a) - totalOf(b);
      return config.sort_order === "asc" ? diff : -diff;
    });
  }

  if (config.top_n !== null && config.top_n > 0) {
    categories = categories.slice(0, config.top_n);
  }

  return {
    categories,
    series: yFields.map((field, column) => ({
      name: field,
      data: categories.map((category) => {
        const found = rows.find((row) => row.x === category);
        return found ? found.values[column] : null;
      }),
    })),
  };
}

function _aggregateValues(
  values: (number | null)[],
  aggregation: ChartAggregation,
): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  if (numbers.length === 0) return null;
  switch (aggregation) {
    case "sum":
      return numbers.reduce((acc, value) => acc + value, 0);
    case "avg":
      return numbers.reduce((acc, value) => acc + value, 0) / numbers.length;
    case "max":
      return Math.max(...numbers);
    case "min":
      return Math.min(...numbers);
    case "first":
      return numbers[0];
    case "last":
      return numbers[numbers.length - 1];
    default:
      return numbers.reduce((acc, value) => acc + value, 0);
  }
}

function _numericValues(result: ComputeResult, column: string): number[] {
  const index = result.columns.indexOf(column);
  return result.rows
    .map((row) => row[index])
    .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
}

function _distinctCount(result: ComputeResult, column: string | null): number {
  if (column === null) return 0;
  const index = result.columns.indexOf(column);
  return new Set(result.rows.map((row) => row[index])).size;
}

/** 柱状图类别数：多维度组合按「组合标签」去重数，不是单列的去重数。 */
function _categoryCount(result: ComputeResult, config: ChartConfig): number {
  const dimColumns = xDimColumns(result, xDimsOf(config));
  if (dimColumns.length > 1) {
    const allowed = xDimAllowedSets(dimColumns);
    const seen = new Set<string>();
    for (const row of result.rows) {
      if (!rowPassesXDims(row, dimColumns, allowed)) continue;
      seen.add(xLabelOf(row, dimColumns));
    }
    return seen.size;
  }
  return _distinctCount(result, config.x_axis);
}

function _sumByCategory(rows: _Row[], category: string): number {
  return rows
    .filter((row) => row.x === category && row.y !== null)
    .reduce((acc, row) => acc + (row.y as number), 0);
}

function _typeLabel(type: ChartType): string {
  return { line: "折线", bar: "柱状", column: "柱状", pie: "饼" }[type] ?? type;
}
