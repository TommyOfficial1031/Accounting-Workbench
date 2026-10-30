export interface HealthResponse {
  status: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export type ColumnDtype = "number" | "string" | "date" | "bool";

export interface ColumnMeta {
  name: string;
  dtype: ColumnDtype;
  category: string | null;
  is_predefined: boolean;
}

export interface DatasetMeta {
  id: string;
  name: string;
  source_path: string;
  sheet_name: string | null;
  columns: ColumnMeta[];
  row_count: number;
  col_count: number;
  created_at: string;
  predefined_hit_count: number;
  fixed_rules_available: boolean;
}

export interface PreviewPage {
  columns: string[];
  rows: unknown[][];
  offset: number;
  total_rows: number;
}

/** 数据集时间范围自动识别（第 11 轮 C）：没有时间列 / 整列为空时三个值都是 null。 */
export interface TimeRangeInfo {
  field: string | null;
  start: string | null;
  end: string | null;
  rows: number;
}

export interface RuleMetric {
  field: string;
  agg: AggFunc;
  alias: string;
}

export interface RuleDerivedMetric {
  expression: string;
  alias: string;
}

export interface FixedRuleInfo {
  name: string;
  available: boolean;
  missing_fields: string[];
  group_by: string[];
  metrics: RuleMetric[];
  derived_metrics: RuleDerivedMetric[];
}

export interface ImportResponse {
  dataset: DatasetMeta;
  preview: PreviewPage;
  warnings: string[];
  fixed_rules: FixedRuleInfo[];
}

export type FilterOp =
  | "eq"
  | "ne"
  | "gt"
  | "ge"
  | "lt"
  | "le"
  | "in"
  | "not_in"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "between"
  | "aboveAvg"
  | "belowAvg";

export type AggFunc = "sum" | "avg" | "max" | "min" | "median" | "count";

export interface TimeRange {
  start: string;
  end: string;
  field: string;
}

export interface FilterCondition {
  field: string;
  op: FilterOp;
  value: unknown;
}

export interface FilterGroup {
  logic: "AND" | "OR";
  conditions: FilterCondition[];
}

export interface GroupByField {
  field: string;
  time_granularity: "day" | null;
}

export interface Metric {
  id: string;
  field: string;
  agg: AggFunc;
  alias: string;
}

export interface DerivedMetric {
  id: string;
  expression: string;
  alias: string;
}

export interface AnalysisConfig {
  dataset_id: string;
  time_range: TimeRange;
  filters: FilterGroup;
  group_by: GroupByField[];
  metrics: Metric[];
  derived_metrics: DerivedMetric[];
}

export interface ComputeResult {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  meta: Record<string, unknown>;
}

/** 图表类型：散点图已于 2026-10-30（第 14 轮）按用户要求下线，不要再加回来。 */
export type ChartType = "line" | "bar" | "column" | "pie";
export type TimeGranularity = "day" | "month" | "quarter" | "year";
export type SortBy = "x" | "y" | "custom";
export type SortOrder = "asc" | "desc";
export type ChartAggregation = "sum" | "avg" | "max" | "min" | "first" | "last";

/** X 轴叠加的一个维度：不勾取值（undefined）= 该维度全部值（沿用单字段的语义）。 */
export interface ChartXDim {
  field: string;
  values?: string[];
}

export interface ChartConfig {
  chart_type: ChartType;
  x_axis: string | null;
  y_axis: string | null;
  series: string | null;
  show_fields: string[];
  sort_by: SortBy;
  sort_order: SortOrder;
  top_n: number | null;
  palette: string;
  title: string;
  show_legend: boolean;
  show_data_labels: boolean;
  time_granularity: TimeGranularity | null;
  aggregation: ChartAggregation;
  /** X 轴叠加的维度（按添加顺序拼「值1·值2…」）；缺省 = 只有 x_axis 单字段 */
  x_dims?: ChartXDim[];
  /** X 轴字段的取值筛选（空 = 全部）；前端本地配置，导出前会落到结果表 */
  x_values?: string[];
  /** 图例/系列显示名覆盖（双击图例改名的结果） */
  label_aliases?: Record<string, string>;
  /** 按顺序给系列上色（空 = 用 palette）；导出时传预览的 PALETTE，保证「导出 = 预览」 */
  series_colors?: string[];
}

export interface Project {
  id: string;
  name: string;
  creator: string;
  created_at: string;
  updated_at: string;
  source_path: string | null;
  source_type: string | null;
  row_count: number | null;
  col_count: number | null;
  analysis_config: AnalysisConfig | null;
  has_result: boolean;
  last_opened_at: string | null;
  /** manual = 点保存；auto = 未保存直接退出的自动保存。 */
  saved_kind?: "manual" | "auto";
  /** 三个工具页的输入快照（分析图表 / 一键算 / 盈亏平衡）。 */
  state?: Record<string, unknown> | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  creator: string;
  created_at: string;
  updated_at: string;
  row_count: number | null;
  col_count: number | null;
  has_result: boolean;
  last_opened_at: string | null;
}

export interface ProjectListResponse {
  items: ProjectSummary[];
  total: number;
}

export interface ProjectDetail {
  project: Project;
  dataset: DatasetMeta;
  result: ComputeResult | null;
  fixed_rules: FixedRuleInfo[];
}

export interface MergeResponse {
  project: Project | null;
  dataset: DatasetMeta | null;
  preview: PreviewPage;
  sources: string[];
  sources_distribution: Record<string, number>;
}

/* ── 一键算（看板）与盈亏平衡（回归）── */
export interface TimeRangePayload {
  start: string;
  end: string;
  field?: string;
}

/* ── 一键算 / 看板 ── */

export interface BoardCell {
  vol: number;
  price: number;
  orig: number;
  disc: number | null;
  unit: number | null;
}

export interface BoardRow {
  label: string;
  cells: BoardCell[];
}

export interface BoardResult {
  rows: BoardRow[];
  bands: string[];
  band_totals: BoardCell[];
  sum_vol: number;
  sum_price: number;
  sum_orig: number;
  weighted_disc: number | null;
  weighted_unit: number | null;
  simple_disc: number | null;
  simple_unit: number | null;
  dim_label: string;
  row_count: number;
  scanned: number;
  filtered: number;
}

export interface BoardRequest {
  dataset_id: string;
  time_range: TimeRangePayload;
  nets?: string[];
  exclude?: string;
  source?: string;
  dims?: Array<"网点" | "省份">;
  dim_values?: Record<string, string[]>;
}

export interface BoardDimSources {
  nets: string[];
  provinces: string[];
}

/* ── 盈亏平衡与折扣分析 ── */

export interface RegressionManualConfig {
  p0: number;
  d: number;
  d_plan: number;
  b_now: number;
  b_plan: number;
  c: number;
  z_now: number;
  z_plan: number;
  step_factors?: number[];
}

export interface RegressionStep {
  factor: number;
  z: number;
  break_even_discount: number | null;
  profit: number;
  rate: number | null;
  judge: string;
}

export interface RegressionManualResult {
  p_now: number;
  m_now: number;
  profit_now: number;
  revenue_now: number;
  rate_now: number | null;
  p_plan: number;
  m_plan: number;
  profit_plan: number;
  revenue_plan: number;
  rate_plan: number | null;
  one_pct: number;
  break_even_discount: number | null;
  steps: RegressionStep[];
  advice: string;
}

export interface GroupPolicy {
  c_line?: number;
  op_cost?: number;
  d_plan?: number;
  z_plan?: number;
}

export interface RegressionTableRequest {
  dataset_id: string;
  time_range: TimeRangePayload;
  dims?: string[];
  picks?: Record<string, string[]>;
  /** 级联映射：父维度字段 → 父值 → 子维度取值集合（省份 → 该省公斤段） */
  cascade?: Record<string, Record<string, string[]>>;
  policies?: Record<string, GroupPolicy>;
  /** 「是否剔除」口径（不传 = 不过滤） */
  exclude?: string;
  /** 「物品来源」口径（不传 = 不过滤） */
  source?: string;
}

export interface RegressionGroup {
  key: string;
  label: string;
  /** 结构化组合（字段 → 取值）；老后端 / 老快照没有这个字段 */
  parts?: Record<string, string>;
  row_count: number;
  z: number;
  price: number;
  orig: number;
  p0: number | null;
  p: number | null;
  d: number | null;
  c_line: number;
  op_cost: number;
  c: number;
  d_plan: number | null;
  z_plan: number | null;
  p_plan: number | null;
  profit_now: number;
  profit_plan: number | null;
  rate_now: number | null;
  rate_plan: number | null;
  filled: boolean;
}

export interface RegressionTableResult {
  groups: RegressionGroup[];
  empty_combos: number;
  filled_count: number;
  z: number;
  z_plan: number | null;
  price: number;
  orig: number;
  p0: number | null;
  p: number | null;
  d: number | null;
  d_plan: number | null;
  revenue_now: number;
  revenue_plan: number | null;
  profit_now: number;
  profit_plan: number | null;
  rate_now: number | null;
  rate_plan: number | null;
  one_pct: number | null;
  advice: string;
}

export interface ValuesResult {
  values: Record<string, string[]>;
  /** 父字段取值 → 该父值下出现过的子字段取值（第 11 轮 A① 级联勾选） */
  cascade?: Record<string, string[]>;
}

/* ── 导出文件管理 ── */

export interface ExportRecordCreate {
  name: string;
  kind: "file" | "folder";
  path: string;
  project_id?: string | null;
  project_name?: string | null;
  creator?: string | null;
}

export interface ExportRecord {
  id: string;
  name: string;
  kind: "file" | "folder";
  path: string;
  project_id: string | null;
  project_name: string | null;
  creator: string | null;
  exported_at: string;
  created_at: string;
}

export interface ExportRecordList {
  items: ExportRecord[];
  total: number;
}

/* ── 设置（数据目录） ── */

export interface AppSettings {
  data_dir: string;
  default_data_dir: string;
  is_default: boolean;
  project_count: number;
}

export interface DataDirMigration {
  data_dir: string;
  previous_dir: string;
  copied_files: number;
  kept_previous: boolean;
}

export interface DataDirUpdateRequest {
  data_dir: string;
}

export interface SettingsUpdateResponse {
  settings: AppSettings;
  migration: DataDirMigration | null;
}
