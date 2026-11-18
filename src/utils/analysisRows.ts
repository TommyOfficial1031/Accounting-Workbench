/** 分析页「条件即维度」行模型 ↔ 后端 AnalysisConfig 的纯函数映射。
 *
 * 基准：_proto/shell-demo.html 的 analysisState（filters / metrics）。
 * 行模型只描述界面，发请求前一律经 buildAnalysisConfig 转成后端配置，
 * 因此导出、保存项目、图表配置都吃同一份 AnalysisConfig。
 *
 * 指标区自 2026-10-27 起改成「指标框 + 表达式记号」（用户定稿需求）：
 * - 一个指标 = 一个指标框 = 一行表达式 `字段(计算方式) 运算符 字段(计算方式) …`；
 * - 运算符只留 ＋ － × ÷ 与括号（AND 取消），允许嵌套括号；
 * - 每个指标框各自成列，多字段的框再额外出一列「计算结果N」。
 */

import type {
  AggFunc,
  AnalysisConfig,
  ColumnMeta,
  DerivedMetric,
  FilterCondition,
  FilterOp,
  GroupByField,
  Metric,
  TimeRange,
} from "../types/api";

/** 原型 TEXT_OPS / NUM_OPS 的合并集合。 */
export type FilterRowOp =
  | "eq"
  | "ne"
  | "startsWith"
  | "endsWith"
  | "contains"
  | "notContains"
  | "gt"
  | "ge"
  | "lt"
  | "le"
  | "between"
  | "aboveAvg"
  | "belowAvg";

export interface AnalysisFilterRow {
  id: string;
  field: string;
  op: FilterRowOp;
  /** 文本 eq/ne 的多选取值；空数组 = 不限制（按该字段展开）。 */
  values: string[];
  value: string;
  value2: string;
}

export interface OpOption {
  value: FilterRowOp;
  label: string;
}

export interface AggOption {
  value: AggFunc;
  label: string;
  short: string;
}

export const TEXT_OPS: OpOption[] = [
  { value: "eq", label: "等于" },
  { value: "ne", label: "不等于" },
  { value: "startsWith", label: "开头是" },
  { value: "endsWith", label: "结尾是" },
  { value: "contains", label: "包含" },
  { value: "notContains", label: "不包含" },
];

export const NUM_OPS: OpOption[] = [
  { value: "eq", label: "等于" },
  { value: "ne", label: "不等于" },
  { value: "gt", label: "大于" },
  { value: "ge", label: "大于或等于" },
  { value: "lt", label: "小于" },
  { value: "le", label: "小于或等于" },
  { value: "between", label: "介于" },
  { value: "aboveAvg", label: "高于平均值" },
  { value: "belowAvg", label: "低于平均值" },
];

export const AGGS: AggOption[] = [
  { value: "sum", label: "求和", short: "合计" },
  { value: "avg", label: "求平均值", short: "均值" },
  { value: "median", label: "求中位数", short: "中位" },
  { value: "max", label: "求最大值", short: "最大" },
  { value: "min", label: "求最小值", short: "最小" },
  { value: "count", label: "计数", short: "计数" },
];

/** 无需填值的运算符（原型 NO_VALUE_OPS）。 */
export const NO_VALUE_OPS: FilterRowOp[] = ["aboveAvg", "belowAvg"];

let rowSeq = 0;

export function nextRowId(prefix: string): string {
  rowSeq += 1;
  return `${prefix}_${rowSeq}`;
}

export function isNumericType(dtype: ColumnMeta["dtype"]): boolean {
  return dtype === "number";
}

export function columnOf(columns: ColumnMeta[], field: string): ColumnMeta | undefined {
  return columns.find((column) => column.name === field);
}

export function isTextField(columns: ColumnMeta[], field: string): boolean {
  const column = columnOf(columns, field);
  return column === undefined ? true : !isNumericType(column.dtype);
}

export function opsFor(columns: ColumnMeta[], field: string): OpOption[] {
  return isTextField(columns, field) ? TEXT_OPS : NUM_OPS;
}

/** 文本 + 等于/不等于 = 分组维度（原型 isDim）。 */
export function isDimRow(row: AnalysisFilterRow, columns: ColumnMeta[]): boolean {
  return isTextField(columns, row.field) && (row.op === "eq" || row.op === "ne");
}

/** 结果表左侧的维度字段（按条件顺序去重）。 */
export function dimFieldsOf(rows: AnalysisFilterRow[], columns: ColumnMeta[]): string[] {
  const fields: string[] = [];
  for (const row of rows) {
    if (!isDimRow(row, columns)) continue;
    if (!fields.includes(row.field)) fields.push(row.field);
  }
  return fields;
}

export function defaultFilterRow(field: string, columns: ColumnMeta[]): AnalysisFilterRow {
  return {
    id: nextRowId("f"),
    field,
    op: isTextField(columns, field) ? "eq" : "gt",
    values: [],
    value: "",
    value2: "",
  };
}

export function aggShort(agg: AggFunc): string {
  return AGGS.find((option) => option.value === agg)?.short ?? "合计";
}

/* ═══════════════════════════ 指标框（一个指标 = 一行表达式）═══════════════════════════ */

/** 指标框内的运算符：用户 2026-10-27 定稿，取消 AND，只留四则。 */
export type MetricOpSymbol = "＋" | "－" | "×" | "÷";

/** 运算符下拉的取值：四则 + 左右括号（括号允许嵌套）。 */
export type MetricOpChoice = MetricOpSymbol | "(" | ")";

/** 运算符下拉的选项顺序（界面直接吃这个数组）。 */
export const METRIC_OPS: MetricOpChoice[] = ["＋", "－", "×", "÷", "(", ")"];

/** 界面运算符 → 后端表达式写法（后端用 ast 解析，括号天然支持）。 */
const BACKEND_OP: Record<MetricOpSymbol, string> = {
  "＋": "+",
  "－": "-",
  "×": "*",
  "÷": "/",
};

/** 后端表达式写法 → 界面运算符（读旧配置时用）。 */
const SYMBOL_OF: Record<string, MetricOpSymbol> = {
  "+": "＋",
  "＋": "＋",
  "-": "－",
  "－": "－",
  "*": "×",
  "×": "×",
  "/": "÷",
  "÷": "÷",
};

/** 字段槽：字段 + 计算方式（聚合方式）。 */
export interface MetricSlot {
  id: string;
  field: string;
  agg: AggFunc;
  /** 固定规则带来的专属列名（「现价合计」「货量」）；空则「字段 + 聚合简称」。 */
  alias?: string;
}

/** 指标框里的一个记号：字段槽 / 运算符 / 括号。 */
export type MetricToken =
  | { kind: "slot"; slot: MetricSlot }
  | { kind: "op"; id: string; value: MetricOpSymbol }
  | { kind: "paren"; id: string; value: "(" | ")" };

/** 一个指标框 = 一行表达式（+ 可选的折叠状态与计算结果名）。 */
export interface MetricBox {
  id: string;
  tokens: MetricToken[];
  /** 计算结果的列名（固定规则给的「单公斤价格 / 折扣」）；空则「计算结果N」。 */
  alias?: string;
  /** 「合并」按钮收起时的状态标记（本文件不参与计算，只跟着走）。 */
  collapsed?: boolean;
  /** 解析不了的派生表达式原样保留（后端按别名仍能算，界面只显示文字）。 */
  rawExpression?: string;
}

export function defaultMetricSlot(field: string, agg: AggFunc = "sum"): MetricSlot {
  return { id: nextRowId("s"), field, agg };
}

export function newOpToken(value: MetricOpSymbol = "＋"): MetricToken {
  return { kind: "op", id: nextRowId("t"), value };
}

export function defaultMetricBox(field: string): MetricBox {
  // 末尾恒留一个运算符位：既是「下一个运算符」，也是「) 把前面字段整体括起来」的落点
  return {
    id: nextRowId("b"),
    tokens: [{ kind: "slot", slot: defaultMetricSlot(field) }, newOpToken("＋")],
  };
}

/** 末尾补一个运算符位（读回来的指标框也要能直接接下一个字段）。 */
function withTrailingOp(box: MetricBox): MetricBox {
  if (box.tokens.length === 0) return box;
  const last = box.tokens[box.tokens.length - 1];
  if (last.kind === "op") return box;
  return { ...box, tokens: [...box.tokens, newOpToken("＋")] };
}

/** 深拷贝指标框（存项目快照时用，避免与界面共享同一批对象）。 */
export function cloneMetricBoxes(boxes: MetricBox[]): MetricBox[] {
  return boxes.map((box) => ({
    ...box,
    tokens: box.tokens.map((token) =>
      token.kind === "slot" ? { kind: "slot", slot: { ...token.slot } } : { ...token },
    ),
  }));
}

/** 指标框里的字段槽（含空槽，界面要显示「选择字段…」）。 */
export function metricSlots(box: MetricBox): MetricSlot[] {
  const slots: MetricSlot[] = [];
  for (const token of box.tokens) {
    if (token.kind === "slot") slots.push(token.slot);
  }
  return slots;
}

/** 已经选了字段的槽。 */
export function filledSlots(box: MetricBox): MetricSlot[] {
  return metricSlots(box).filter((slot) => slot.field.trim() !== "");
}

/** 至少两个字段槽（或带原样表达式）= 会多出一列「计算结果」。 */
export function isComputedBox(box: MetricBox): boolean {
  return box.rawExpression !== undefined || filledSlots(box).length >= 2;
}

/** 指标列名：优先用固定规则给的专属名，否则「字段 + 聚合简称」。 */
export function metricLabel(item: { field: string; agg: AggFunc; alias?: string }): string {
  const alias = (item.alias ?? "").trim();
  return alias !== "" ? alias : `${item.field}${aggShort(item.agg)}`;
}

/** 往指标框末尾追加一个字段槽（用末尾运算符位连接，追加后重新补一个运算符位）。 */
export function appendMetricSlot(box: MetricBox, field: string, agg: AggFunc = "sum"): MetricBox {
  const tokens = [...box.tokens];
  const slotToken: MetricToken = { kind: "slot", slot: defaultMetricSlot(field, agg) };
  const last = tokens[tokens.length - 1];
  // 末尾已经是运算符位（常态）：直接补槽；否则先补一个 ＋ 再用
  if (last !== undefined && last.kind === "op") tokens.push(slotToken);
  else tokens.push(newOpToken("＋"), slotToken);
  tokens.push(newOpToken("＋"));
  return { ...box, tokens, collapsed: false };
}

/** 删掉一个字段槽（连同它旁边的运算符一起删，避免留下悬空运算符）。 */
export function removeMetricSlot(box: MetricBox, slotId: string): MetricBox {
  const index = box.tokens.findIndex(
    (token) => token.kind === "slot" && token.slot.id === slotId,
  );
  if (index < 0) return box;

  const tokens: MetricToken[] = [];
  for (let cursor = 0; cursor < box.tokens.length; cursor += 1) {
    if (cursor === index) continue;
    // 首个槽被删时砍掉它后面的运算符，其余情况砍掉前面的
    if (index === 0 && cursor === index + 1 && box.tokens[cursor].kind === "op") continue;
    if (index > 0 && cursor === index - 1 && box.tokens[cursor].kind === "op") continue;
    tokens.push(box.tokens[cursor]);
  }
  // 一个槽都不剩时留一个空槽，框还在（用户可以继续选字段）
  if (!tokens.some((token) => token.kind === "slot")) {
    tokens.push({ kind: "slot", slot: defaultMetricSlot("") });
  }
  return { ...box, tokens };
}

/** 删掉一个括号记号。 */
export function removeMetricParen(box: MetricBox, tokenId: string): MetricBox {
  const tokens = box.tokens.filter((token) => !(token.kind === "paren" && token.id === tokenId));
  if (tokens.length === box.tokens.length) return box;
  return { ...box, tokens };
}

/** 括号深度（用于「字段框间距自动收紧」与括号高亮）。 */
export function parenDepths(tokens: MetricToken[]): number[] {
  const depths: number[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === "paren" && token.value === "(") {
      depths.push(depth);
      depth += 1;
      continue;
    }
    if (token.kind === "paren" && token.value === ")") {
      depth = Math.max(0, depth - 1);
      depths.push(depth);
      continue;
    }
    depths.push(depth);
  }
  return depths;
}

/**
 * 运算符下拉选中某个值后的新指标框（用户定稿的三条交互都在这）：
 * - ＋ － × ÷：直接替换这个运算符；
 * - `(`：在这个运算符后面插入左括号，并在末尾自动补一个 `)` 占位；
 * - `)`：把这一格前面的字段整体括起来（缺左括号就在开头补一个），
 *   同时在这一格后面自动补一个运算符位（默认 ＋）。
 */
export function applyOpChoice(
  box: MetricBox,
  tokenId: string,
  choice: MetricOpChoice,
): MetricBox {
  const index = box.tokens.findIndex((token) => token.kind === "op" && token.id === tokenId);
  if (index < 0) return box;
  const tokens = box.tokens.map((token) => ({ ...token })) as MetricToken[];
  const target = tokens[index] as Extract<MetricToken, { kind: "op" }>;

  if (choice === "＋" || choice === "－" || choice === "×" || choice === "÷") {
    target.value = choice;
    return { ...box, tokens };
  }

  if (choice === "(") {
    // 「a × ( b」+ 末尾自动补「)」占位
    tokens.splice(index + 1, 0, { kind: "paren", id: nextRowId("t"), value: "(" });
    tokens.push({ kind: "paren", id: nextRowId("t"), value: ")" });
    return { ...box, tokens };
  }

  // 选 `)`：把前面字段整体括起来
  const before = tokens.slice(0, index);
  let depth = 0;
  for (const token of before) {
    if (token.kind !== "paren") continue;
    if (token.value === "(") depth += 1;
    else depth = Math.max(0, depth - 1);
  }
  if (depth === 0) tokens.unshift({ kind: "paren", id: nextRowId("t"), value: "(" });
  // 右括号插在这个运算符位前面：括号后面的运算符位天然就是「自动补的那个运算符位」
  const opIndex = tokens.findIndex((token) => token.kind === "op" && token.id === target.id);
  const insertAt = opIndex < 0 ? tokens.length : opIndex;
  tokens.splice(insertAt, 0, { kind: "paren", id: nextRowId("t"), value: ")" });
  return { ...box, tokens };
}

type Atom =
  | { kind: "slot"; slot: MetricSlot }
  | { kind: "op"; value: MetricOpSymbol }
  | { kind: "paren"; value: "(" | ")" };

function atomSignature(atoms: Atom[]): string {
  return atoms
    .map((atom) => (atom.kind === "slot" ? `s:${atom.slot.id}` : `${atom.kind}:${atom.value}`))
    .join("|");
}

/** 括号配平：多余的右括号丢掉，末尾没关的左括号补右括号。 */
function balanceParens(atoms: Atom[]): Atom[] {
  const balanced: Atom[] = [];
  let depth = 0;
  for (const atom of atoms) {
    if (atom.kind === "paren" && atom.value === "(") {
      depth += 1;
      balanced.push(atom);
      continue;
    }
    if (atom.kind === "paren" && atom.value === ")") {
      if (depth === 0) continue;
      depth -= 1;
      balanced.push(atom);
      continue;
    }
    balanced.push(atom);
  }
  while (depth > 0) {
    balanced.push({ kind: "paren", value: ")" });
    depth -= 1;
  }
  return balanced;
}

/** 去掉空括号组 `( )`（连同其中悬空的东西不会再出现，这里只处理紧邻的一对）。 */
function dropEmptyGroups(atoms: Atom[]): Atom[] {
  let current = atoms;
  let changed = true;
  while (changed) {
    changed = false;
    const next: Atom[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const atom = current[index];
      const follower = current[index + 1];
      if (
        atom.kind === "paren" &&
        atom.value === "(" &&
        follower !== undefined &&
        follower.kind === "paren" &&
        follower.value === ")"
      ) {
        index += 1;
        changed = true;
        continue;
      }
      next.push(atom);
    }
    current = next;
  }
  return current;
}

/** 运算符必须夹在两个操作数之间（操作数 = 字段槽 / 右括号 / 左括号）。 */
function dropDanglingOps(atoms: Atom[]): Atom[] {
  const kept: Atom[] = [];
  for (const atom of atoms) {
    if (atom.kind !== "op") {
      kept.push(atom);
      continue;
    }
    const previous = kept[kept.length - 1];
    const leftOk =
      previous !== undefined &&
      (previous.kind === "slot" || (previous.kind === "paren" && previous.value === ")"));
    if (!leftOk) continue;
    kept.push(atom);
  }
  // 右侧：运算符后面必须跟字段槽或左括号
  const result: Atom[] = [];
  for (let index = 0; index < kept.length; index += 1) {
    const atom = kept[index];
    if (atom.kind === "op") {
      const follower = kept[index + 1];
      const rightOk =
        follower !== undefined &&
        (follower.kind === "slot" || (follower.kind === "paren" && follower.value === "("));
      if (!rightOk) continue;
    }
    result.push(atom);
  }
  return result;
}

/** 记号 → 原子序列：丢空槽、配平括号、清理悬空运算符，保证后端表达式永远合法。 */
function atomsOf(box: MetricBox): Atom[] {
  const raw: Atom[] = [];
  for (const token of box.tokens) {
    if (token.kind === "slot") {
      if (token.slot.field.trim() === "") continue;
      raw.push({ kind: "slot", slot: token.slot });
      continue;
    }
    if (token.kind === "op") raw.push({ kind: "op", value: token.value });
    else raw.push({ kind: "paren", value: token.value });
  }

  let atoms = raw;
  for (let round = 0; round < 8; round += 1) {
    const before = atomSignature(atoms);
    atoms = dropDanglingOps(dropEmptyGroups(balanceParens(atoms)));
    if (atomSignature(atoms) === before) break;
  }
  return atoms;
}

function joinAtoms(atoms: Atom[], render: (atom: Atom) => string): string {
  return atoms
    .map(render)
    .join(" ")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")");
}

/** 指标框 → 人读的表达式（同时用于提示与折叠摘要）。 */
export function boxExpression(
  box: MetricBox,
  labelOf: (slot: MetricSlot) => string = metricLabel,
): string {
  if (box.rawExpression !== undefined) return box.rawExpression;
  return joinAtoms(atomsOf(box), (atom) => {
    if (atom.kind === "slot") return labelOf(atom.slot);
    return atom.value;
  });
}

/** 指标框 → 后端派生表达式（字段槽换成 m1..mn，符号换成 + - * /）。 */
export function boxBackendExpression(
  box: MetricBox,
  idOf: (slot: MetricSlot) => string,
): string {
  if (box.rawExpression !== undefined) return box.rawExpression;
  return joinAtoms(atomsOf(box), (atom) => {
    if (atom.kind === "slot") return idOf(atom.slot);
    if (atom.kind === "op") return BACKEND_OP[atom.value];
    return atom.value;
  });
}

/** 会出「计算结果」列的指标框。 */
export function computedBoxes(boxes: MetricBox[]): MetricBox[] {
  return boxes.filter(isComputedBox);
}

/** 计算结果列名：固定规则给的名字优先，否则单条叫「计算结果」、多条编号。 */
export function boxLabel(box: MetricBox, ordinal: number, total: number): string {
  const alias = (box.alias ?? "").trim();
  if (alias !== "") return alias;
  return total <= 1 ? "计算结果" : `计算结果${ordinal}`;
}

/** 计算结果的列名列表（与结果表列顺序一致）。 */
export function derivedLabels(boxes: MetricBox[]): string[] {
  const computed = computedBoxes(boxes);
  return computed.map((box, index) => boxLabel(box, index + 1, computed.length));
}

interface SlotEntry {
  slot: MetricSlot;
  /** 后端指标 id：m1..mn */
  id: string;
  /** 后端指标别名（同名自动加序号）。 */
  alias: string;
}

/** 摊平所有指标框的字段槽，统一编号（m1..mn）+ 去重别名。 */
function slotEntriesOf(boxes: MetricBox[]): SlotEntry[] {
  const used = new Set<string>();
  const entries: SlotEntry[] = [];
  for (const box of boxes) {
    for (const slot of metricSlots(box)) {
      if (slot.field.trim() === "") continue;
      const base = metricLabel(slot);
      let alias = base;
      let counter = 2;
      while (used.has(alias)) {
        alias = `${base}_${counter}`;
        counter += 1;
      }
      used.add(alias);
      entries.push({ slot, id: `m${entries.length + 1}`, alias });
    }
  }
  return entries;
}

/** 指标框 → 后端 metrics（id 固定 m1..mn，派生表达式引用 id）。 */
export function metricsOf(boxes: MetricBox[]): Metric[] {
  return slotEntriesOf(boxes).map((entry) => ({
    id: entry.id,
    field: entry.slot.field,
    agg: entry.slot.agg,
    alias: entry.alias,
  }));
}

/** 指标框 → 后端 derived_metrics（按括号拼表达式，如 `(m1 - m2) / m1`）。 */
export function derivedMetricsOf(boxes: MetricBox[]): DerivedMetric[] {
  const idOf = new Map(slotEntriesOf(boxes).map((entry) => [entry.slot.id, entry.id]));
  const computed = computedBoxes(boxes);
  return computed.map((box, index) => ({
    id: `d${index + 1}`,
    expression: boxBackendExpression(box, (slot) => idOf.get(slot.id) ?? ""),
    alias: boxLabel(box, index + 1, computed.length),
  }));
}

/** 结果表的列标题：维度 → 指标 → 计算结果（原型 renderResult 的 head）。 */
export function resultColumnsOf(
  filterRows: AnalysisFilterRow[],
  metricBoxes: MetricBox[],
  columns: ColumnMeta[],
): string[] {
  return [
    ...dimFieldsOf(filterRows, columns),
    ...metricBoxes.flatMap((box) =>
      metricSlots(box)
        .filter((slot) => slot.field.trim() !== "")
        .map(metricLabel),
    ),
    ...derivedLabels(metricBoxes),
  ];
}

function toNumberValue(text: string): number | string {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : trimmed;
}

function conditionOf(row: AnalysisFilterRow, columns: ColumnMeta[]): FilterCondition[] {
  const text = isTextField(columns, row.field);
  const single = row.value.trim();
  const second = row.value2.trim();

  if (row.op === "aboveAvg" || row.op === "belowAvg") {
    return [{ field: row.field, op: row.op as FilterOp, value: null }];
  }

  if (text && (row.op === "eq" || row.op === "ne")) {
    if (row.values.length === 0) return [];
    return [
      {
        field: row.field,
        op: row.op === "eq" ? "in" : "not_in",
        value: [...row.values],
      },
    ];
  }

  if (row.op === "between") {
    if (single === "" || second === "") return [];
    const low = toNumberValue(single);
    const high = toNumberValue(second);
    if (typeof low !== "number" || typeof high !== "number") return [];
    return [{ field: row.field, op: "between", value: [low, high] }];
  }

  if (single === "") return [];
  const value = text ? single : toNumberValue(single);
  return [{ field: row.field, op: row.op as FilterOp, value }];
}

export function conditionsOf(
  rows: AnalysisFilterRow[],
  columns: ColumnMeta[],
): FilterCondition[] {
  return rows.flatMap((row) => conditionOf(row, columns));
}

export function groupByOf(rows: AnalysisFilterRow[], columns: ColumnMeta[]): GroupByField[] {
  return dimFieldsOf(rows, columns).map((field) => ({
    field,
    time_granularity: null,
  }));
}

/** 分析页配置 → 后端 AnalysisConfig。
 *
 * 指标可以为空（保存项目时允许还没配指标）；是否能计算由调用方判断。
 * 时间范围缺失时返回 null（后端必填）。
 */
export function buildAnalysisConfig(
  datasetId: string,
  timeRange: TimeRange | null,
  filterRows: AnalysisFilterRow[],
  metricBoxes: MetricBox[],
  columns: ColumnMeta[],
): AnalysisConfig | null {
  if (timeRange === null) return null;

  return {
    dataset_id: datasetId,
    time_range: timeRange,
    filters: { logic: "AND", conditions: conditionsOf(filterRows, columns) },
    group_by: groupByOf(filterRows, columns),
    metrics: metricsOf(metricBoxes),
    derived_metrics: derivedMetricsOf(metricBoxes),
  };
}

/* ─────────────── 后端配置 / 固定规则 → 指标框（双向可逆）─────────────── */

type ParsedToken =
  | { kind: "ref"; index: number }
  | { kind: "op"; value: MetricOpSymbol }
  | { kind: "paren"; value: "(" | ")" };

/** 把派生表达式拆成记号；名称按「别名 / id」最长匹配，认不出就返回 null。 */
function parseExpression(
  expression: string,
  names: { index: number; names: string[] }[],
): ParsedToken[] | null {
  const candidates = names
    .flatMap((entry) => entry.names.map((name) => ({ index: entry.index, name })))
    .filter((entry) => entry.name.trim() !== "")
    .sort((left, right) => right.name.length - left.name.length);

  const tokens: ParsedToken[] = [];
  let cursor = 0;
  while (cursor < expression.length) {
    const char = expression[cursor];
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      cursor += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char });
      cursor += 1;
      continue;
    }
    const symbol = SYMBOL_OF[char];
    if (symbol !== undefined) {
      tokens.push({ kind: "op", value: symbol });
      cursor += 1;
      continue;
    }
    const hit = candidates.find((entry) => expression.startsWith(entry.name, cursor));
    if (hit === undefined) return null;
    tokens.push({ kind: "ref", index: hit.index });
    cursor += hit.name.length;
  }
  return tokens;
}

/** 后端 metrics + derived_metrics → 指标框（固定规则与打开项目共用）。 */
export function boxesFromMetrics(
  metrics: { field: string; agg: AggFunc; alias: string; id?: string }[],
  derived: { expression: string; alias: string }[],
): MetricBox[] {
  const slots: MetricSlot[] = metrics.map((metric) => ({
    id: nextRowId("s"),
    field: metric.field,
    agg: metric.agg,
    alias: metric.alias,
  }));
  const names = metrics.map((metric, index) => ({
    index,
    names: [metric.alias, metric.id ?? ""].filter(
      (name, position, list) => name !== "" && list.indexOf(name) === position,
    ),
  }));

  const assigned = new Set<number>();
  const ordered: { box: MetricBox; first: number }[] = [];
  const leftovers: { expression: string; alias: string }[] = [];

  for (const item of derived) {
    const parsed = parseExpression(item.expression, names);
    if (parsed === null) {
      leftovers.push(item);
      continue;
    }
    const refs = parsed.filter((token): token is { kind: "ref"; index: number } => token.kind === "ref");
    const unique = new Set(refs.map((ref) => ref.index));
    // 同一个指标被引用两次 / 已被别的表达式占用：退回原样保留表达式
    if (refs.length === 0 || unique.size !== refs.length || refs.some((ref) => assigned.has(ref.index))) {
      leftovers.push(item);
      continue;
    }
    const tokens: MetricToken[] = parsed.map((token) => {
      if (token.kind === "paren") {
        return { kind: "paren", id: nextRowId("t"), value: token.value };
      }
      if (token.kind === "op") return { kind: "op", id: nextRowId("t"), value: token.value };
      assigned.add(token.index);
      return { kind: "slot", slot: slots[token.index] };
    });
    ordered.push({
      box: withTrailingOp({ id: nextRowId("b"), tokens, alias: item.alias }),
      first: refs[0].index,
    });
  }

  metrics.forEach((_, index) => {
    if (assigned.has(index)) return;
    ordered.push({
      box: { id: nextRowId("b"), tokens: [{ kind: "slot", slot: slots[index] }] },
      first: index,
    });
  });

  ordered.sort((left, right) => left.first - right.first);
  const boxes = ordered.map((entry) => withTrailingOp(entry.box));

  // 解析不了的表达式：原样挂一个框（后端按别名仍能算，界面只显示文字）
  for (const item of leftovers) {
    boxes.push({
      id: nextRowId("b"),
      tokens: [],
      alias: item.alias,
      rawExpression: item.expression,
    });
  }
  return boxes;
}

/** 固定规则 → 行模型（维度按 group_by 顺序，指标框按派生表达式还原）。 */
export function rowsFromRule(
  rule: {
    group_by: string[];
    metrics: { field: string; agg: AggFunc; alias: string }[];
    derived_metrics: { expression: string; alias: string }[];
  },
  columns: ColumnMeta[],
): { filterRows: AnalysisFilterRow[]; metricBoxes: MetricBox[] } {
  const filterRows = rule.group_by.map((field) => defaultFilterRow(field, columns));
  const metricBoxes = boxesFromMetrics(rule.metrics, rule.derived_metrics);
  return { filterRows, metricBoxes };
}

/** 旧版行模型（指标行 + 连接符）里的一行，只用于读旧项目快照。 */
export interface LegacyMetricRow {
  id: string;
  field: string;
  agg: AggFunc;
  /** 与上一行的连接符；首行恒为空串。 */
  op: string;
  alias?: string;
  /** 计算结果的名称（挂在链首行）。 */
  chainAlias?: string;
}

/** 旧版指标行 → 指标框（AND / 空 = 另起一个指标框）。 */
export function boxesFromLegacyRows(rows: LegacyMetricRow[]): MetricBox[] {
  const boxes: MetricBox[] = [];
  let current: MetricBox | null = null;
  rows.forEach((row, index) => {
    const connector = index === 0 ? "" : rows[index - 1].op;
    const slotToken: MetricToken = {
      kind: "slot",
      slot: { id: nextRowId("s"), field: row.field, agg: row.agg, alias: row.alias },
    };
    if (current === null || connector === "AND" || connector === "") {
      current = { id: nextRowId("b"), tokens: [slotToken], alias: row.chainAlias };
      boxes.push(current);
      return;
    }
    current.tokens.push(
      { kind: "op", id: nextRowId("t"), value: SYMBOL_OF[connector] ?? "＋" },
      slotToken,
    );
  });
  return boxes.map(withTrailingOp);
}

/** 后端配置 → 行模型（打开项目 / 恢复保存过的分析时用）。 */
export function rowsFromConfig(
  config: AnalysisConfig | null,
  columns: ColumnMeta[],
): { filterRows: AnalysisFilterRow[]; metricBoxes: MetricBox[] } {
  if (config === null) return { filterRows: [], metricBoxes: [] };

  const filterRows: AnalysisFilterRow[] = [];
  const seenDims: string[] = [];

  for (const condition of config.filters.conditions) {
    const text = isTextField(columns, condition.field);
    const base: AnalysisFilterRow = {
      id: nextRowId("f"),
      field: condition.field,
      op: "eq",
      values: [],
      value: "",
      value2: "",
    };

    if (condition.op === "in" || condition.op === "not_in") {
      const values = Array.isArray(condition.value)
        ? condition.value.map((item) => String(item))
        : [String(condition.value)];
      filterRows.push({
        ...base,
        op: condition.op === "in" ? "eq" : "ne",
        values,
      });
      if (text && !seenDims.includes(condition.field)) seenDims.push(condition.field);
      continue;
    }

    if (text && (condition.op === "eq" || condition.op === "ne")) {
      filterRows.push({
        ...base,
        op: condition.op,
        values: [String(condition.value)],
      });
      if (!seenDims.includes(condition.field)) seenDims.push(condition.field);
      continue;
    }

    if (condition.op === "between") {
      const bounds = Array.isArray(condition.value) ? condition.value : [];
      filterRows.push({
        ...base,
        op: "between",
        value: bounds[0] === undefined ? "" : String(bounds[0]),
        value2: bounds[1] === undefined ? "" : String(bounds[1]),
      });
      continue;
    }

    filterRows.push({
      ...base,
      op: condition.op as FilterRowOp,
      value:
        condition.op === "aboveAvg" || condition.op === "belowAvg"
          ? ""
          : String(condition.value ?? ""),
    });
  }

  // group_by 里有、条件里没体现的维度补成「不限制」的条件行
  for (const group of config.group_by) {
    if (seenDims.includes(group.field)) continue;
    filterRows.push(defaultFilterRow(group.field, columns));
    seenDims.push(group.field);
  }

  const metricBoxes = boxesFromMetrics(config.metrics, config.derived_metrics);
  return { filterRows, metricBoxes };
}

/** 月份预设：本月 / 上月（原型分段控件）。 */
export function presetRange(preset: "本月" | "上月", today = new Date()): {
  start: string;
  end: string;
} {
  const year = today.getFullYear();
  const month = today.getMonth();
  const offset = preset === "上月" ? -1 : 0;
  const first = new Date(year, month + offset, 1);
  const last = new Date(year, month + offset + 1, 0);
  return { start: formatDate(first), end: formatDate(last) };
}

function formatDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
