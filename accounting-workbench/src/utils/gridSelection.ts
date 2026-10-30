/** 表格选中模型（原型 sel：cell / row / col 三种模式 + 状态条文案）。
 *
 * 纯函数，便于单测；DataGrid 只负责把结果映射到 AG Grid 的类名与 API 调用。
 */

export type GridSelectionMode = "none" | "cell" | "row" | "col" | "all";

export interface CellPosition {
  row: number;
  col: number;
}

export interface GridSelection {
  mode: GridSelectionMode;
  cell: CellPosition | null;
  rows: number[];
  cols: number[];
}

export interface ColumnRef {
  name: string;
  numeric: boolean;
}

export const EMPTY_SELECTION: GridSelection = {
  mode: "none",
  cell: null,
  rows: [],
  cols: [],
};

/** 是否按住了多选修饰键（原型 Ctrl / ⌘ / Shift 均可累加）。 */
export function isAdditive(event: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): boolean {
  return event.ctrlKey === true || event.metaKey === true || event.shiftKey === true;
}

export function selectCell(row: number, col: number): GridSelection {
  return { mode: "cell", cell: { row, col }, rows: [], cols: [] };
}

function toggle(list: number[], value: number): number[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

export function selectRow(
  current: GridSelection,
  row: number,
  additive: boolean,
): GridSelection {
  const rows = additive ? toggle(current.mode === "row" ? current.rows : [], row) : [row];
  return { mode: rows.length === 0 ? "none" : "row", cell: null, rows, cols: [] };
}

export function selectColumn(
  current: GridSelection,
  col: number,
  additive: boolean,
): GridSelection {
  const cols = additive ? toggle(current.mode === "col" ? current.cols : [], col) : [col];
  return { mode: cols.length === 0 ? "none" : "col", cell: null, rows: [], cols };
}

/** Ctrl+A：选中全部数据区域（原型 mod+A）。 */
export function selectAll(): GridSelection {
  return { mode: "all", cell: null, rows: [], cols: [] };
}

/** 列字母：0→A、25→Z、26→AA（原型的 colLetter）。 */
export function columnLetter(index: number): string {
  if (!Number.isFinite(index) || index < 0) return "";
  let value = Math.floor(index);
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return letters;
}

/** 状态条左侧文案（原型 updateStatus 的 sb-selected）。 */
export function selectionPrimary(
  selection: GridSelection,
  columns: ColumnRef[],
): string {
  if (selection.mode === "all") return "已选全部";
  if (selection.mode === "cell" && selection.cell !== null) {
    const column = columns[selection.cell.col];
    const name = column?.name ?? "—";
    return `${columnLetter(selection.cell.col)}${selection.cell.row + 1} · ${name}`;
  }
  if (selection.mode === "row" && selection.rows.length > 0) {
    return `已选 ${selection.rows.length} 行`;
  }
  if (selection.mode === "col" && selection.cols.length > 0) {
    const names = selection.cols.map((col) => columns[col]?.name ?? `列${col + 1}`);
    return `已选 ${selection.cols.length} 列：${names.join("、")}`;
  }
  return "未选择";
}

/** 列选择模式下需要求和的字段（全是数值列才汇总，原型行为）。 */
export function selectionNumericFields(
  selection: GridSelection,
  columns: ColumnRef[],
): string[] {
  if (selection.mode !== "col" || selection.cols.length === 0) return [];
  if (selection.cols.length > 4) return [];
  const numeric = selection.cols.filter((col) => columns[col]?.numeric === true);
  if (numeric.length !== selection.cols.length) return [];
  return numeric.map((col) => columns[col].name);
}

/** 当前选中状态对应「哪些行 / 哪些列」要高亮（cell 模式高亮单个单元格）。 */
export function highlightRows(selection: GridSelection): Set<number> {
  return new Set(selection.mode === "row" ? selection.rows : []);
}

export function highlightCols(selection: GridSelection): Set<number> {
  return new Set(selection.mode === "col" ? selection.cols : []);
}

/** 剪贴板 / 增删行列要用的锚点：单元格模式取该格，行模式取首行首列，列模式取首行该列。 */
export function selectionAnchor(selection: GridSelection): CellPosition | null {
  if (selection.mode === "cell") return selection.cell;
  if (selection.mode === "row" && selection.rows.length > 0) {
    return { row: Math.min(...selection.rows), col: 0 };
  }
  if (selection.mode === "col" && selection.cols.length > 0) {
    return { row: 0, col: Math.min(...selection.cols) };
  }
  if (selection.mode === "all") return { row: 0, col: 0 };
  return null;
}

/** 「分析」按钮要带进分析页的列：整列选中取全部列，单元格取该列；行模式不带列。 */
export function selectedColumnIndices(selection: GridSelection): number[] {
  if (selection.mode === "col" && selection.cols.length > 0) {
    return [...selection.cols].sort((left, right) => left - right);
  }
  if (selection.mode === "cell" && selection.cell !== null) return [selection.cell.col];
  return [];
}
