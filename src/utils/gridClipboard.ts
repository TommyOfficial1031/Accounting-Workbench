/** 表格剪贴板：与 Excel 互通的 TSV 序列化 / 解析 + 粘贴落点计算。
 *
 * 纯函数，DataGrid 负责从 AG Grid 取值、写回后端。
 */

import type { CellPosition, GridSelection } from "./gridSelection";
import { selectionAnchor } from "./gridSelection";

/** 单个粘贴操作最多写多少个单元格（防止一次误粘贴把 10 万行都改了）。 */
export const MAX_PASTE_CELLS = 4000;

export function toTsv(matrix: string[][]): string {
  return matrix.map((row) => row.join("\t")).join("\n");
}

/** 解析 TSV/纯文本：去掉末尾空白行列，保留中间空单元格。 */
export function fromTsv(text: string): string[][] | null {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.trim() === "") return null;
  const rows = normalized.split("\n").map((line) => line.split("\t"));
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.every((cell) => cell.trim() === "")) rows.pop();
    else break;
  }
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => {
    const filled = [...row];
    while (filled.length < width) filled.push("");
    return filled;
  });
}

export interface PastePlan {
  row: number;
  col: number;
  rows: number;
  cols: number;
  cells: { row: number; col: number; value: string }[];
  /** 被丢掉的行数（超过 MAX_PASTE_CELLS 时） */
  droppedRows: number;
}

/** 把矩阵贴到锚点：越界或超量的部分丢弃，返回可提交给后端的 set_cells 指令。 */
export function planPaste(
  matrix: string[][],
  anchor: CellPosition,
  maxRows: number,
  maxCols: number,
): PastePlan {
  const cols = Math.max(0, ...matrix.map((row) => row.length));
  if (matrix.length === 0 || cols === 0) {
    return {
      row: anchor.row,
      col: anchor.col,
      rows: 0,
      cols: 0,
      cells: [],
      droppedRows: 0,
    };
  }

  const limitRows = Math.max(1, Math.floor(MAX_PASTE_CELLS / cols));
  const rows = Math.min(matrix.length, limitRows, Math.max(0, maxRows - anchor.row));
  const usableCols = Math.min(cols, Math.max(0, maxCols - anchor.col));

  const cells: PastePlan["cells"] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const source = matrix[rowIndex] ?? [];
    for (let colIndex = 0; colIndex < usableCols; colIndex += 1) {
      cells.push({
        row: anchor.row + rowIndex,
        col: anchor.col + colIndex,
        value: source[colIndex] ?? "",
      });
    }
  }
  return {
    row: anchor.row,
    col: anchor.col,
    rows,
    cols: usableCols,
    cells,
    droppedRows: matrix.length - rows,
  };
}

/** 复制范围：单元格 = 1×1；行模式 = 选中行 × 全部列；列模式 = 全部行 × 选中列。 */
export interface CopyRange {
  rows: number[];
  cols: number[];
}

export function copyRangeOf(
  selection: GridSelection,
  rowCount: number,
  colCount: number,
): CopyRange | null {
  if (selection.mode === "cell" && selection.cell !== null) {
    return { rows: [selection.cell.row], cols: [selection.cell.col] };
  }
  if (selection.mode === "row" && selection.rows.length > 0) {
    return {
      rows: [...selection.rows].sort((left, right) => left - right),
      cols: Array.from({ length: colCount }, (_, index) => index),
    };
  }
  if (selection.mode === "col" && selection.cols.length > 0) {
    return {
      rows: Array.from({ length: rowCount }, (_, index) => index),
      cols: [...selection.cols].sort((left, right) => left - right),
    };
  }
  if (selection.mode === "all") {
    return {
      rows: Array.from({ length: rowCount }, (_, index) => index),
      cols: Array.from({ length: colCount }, (_, index) => index),
    };
  }
  return null;
}

/** 粘贴锚点：选中单元格 / 行 / 列的第一格；没选中就用左上角。 */
export function pasteAnchor(selection: GridSelection): CellPosition {
  return selectionAnchor(selection) ?? { row: 0, col: 0 };
}
