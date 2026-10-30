import { create } from "zustand";
import { compute as apiCompute } from "../api/compute";
import {
  fetchPreviewPage,
  importFile as apiImportFile,
} from "../api/import";
import {
  patchDataset,
  type EditOp,
  type EditPayload,
  type EditResponse,
} from "../api/dataset";
import type { DatasetMeta, FixedRuleInfo, PreviewPage } from "../types/api";
import {
  EMPTY_SELECTION,
  selectionAnchor,
  selectAll as selectAllSelection,
  type GridSelection,
} from "../utils/gridSelection";
import { copyRangeOf, planPaste, pasteAnchor, toTsv } from "../utils/gridClipboard";
import { useDirtyStore } from "./dirtyStore";

function rowIndicesOf(selection: GridSelection): number[] {
  if (selection.mode === "row") return [...selection.rows].sort((left, right) => left - right);
  if (selection.mode === "cell" && selection.cell !== null) return [selection.cell.row];
  return [];
}

function colIndicesOf(selection: GridSelection): number[] {
  if (selection.mode === "col") return [...selection.cols].sort((left, right) => left - right);
  if (selection.mode === "cell" && selection.cell !== null) return [selection.cell.col];
  return [];
}

/** 系统剪贴板（写不进去就算了，内部剪贴板仍然可用）。 */
async function writeSystemClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // WebView 里可能没有剪贴板权限：忽略，粘贴走内部剪贴板
  }
}

interface TableState {
  dataset: DatasetMeta | null;
  preview: PreviewPage | null;
  warnings: string[];
  fixedRules: FixedRuleInfo[];
  loading: boolean;
  error: string | null;
  editVersion: number;
  /** 表格底部状态条：选中的数值列求和/计数（按 字段 缓存，编辑后失效）。 */
  columnStats: Record<string, { sum: number | null; count: number | null }>;
  /** 选中态（单元格 / 行 / 列 / 全选），工具栏与右键菜单共用。 */
  selection: GridSelection;
  /** 查找框关键字：只高亮已加载行里命中的单元格。 */
  find: string;
  /** 内部剪贴板（TSV 矩阵），系统剪贴板不可用时兜底。 */
  clipboard: string[][] | null;
  /** 剪切来源区域：下一次粘贴时一并清空。 */
  cutSource: {
    rowStart: number;
    rowEnd: number;
    colStart: number;
    colEnd: number;
  } | null;
  canUndo: boolean;
  canRedo: boolean;
  importFile: (path: string, encoding?: string) => Promise<void>;
  fetchPage: (offset: number, limit: number) => Promise<PreviewPage>;
  loadDataset: (dataset: DatasetMeta, fixedRules: FixedRuleInfo[]) => void;
  applyEdit: (op: EditOp, payload?: EditPayload) => Promise<EditResponse | null>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  reset: () => Promise<void>;
  /** 整表口径的列汇总（选中整列时状态条要显示求和/平均）。 */
  summarizeColumns: (fields: string[]) => Promise<void>;
  setSelection: (selection: GridSelection) => void;
  selectAllCells: () => void;
  setFind: (text: string) => void;
  /** 复制：DataGrid 取好矩阵后交给 store（写内部剪贴板 + 系统剪贴板）。 */
  copySelection: (matrix: string[][]) => void;
  /** 剪切：同上，并记下要被清空的来源区域。 */
  cutSelection: (matrix: string[][]) => void;
  /** 粘贴到当前选中位置（有剪切来源时用 cut_paste 一次提交）。 */
  pasteCells: (external: string[][] | null) => Promise<void>;
  insertRows: (count?: number, at?: number) => Promise<void>;
  insertCols: (count?: number, at?: number) => Promise<void>;
  deleteRows: () => Promise<void>;
  deleteCols: () => Promise<void>;
  setError: (message: string | null) => void;
}

export const useTableStore = create<TableState>((set, get) => ({
  dataset: null,
  preview: null,
  warnings: [],
  fixedRules: [],
  loading: false,
  error: null,
  editVersion: 0,
  columnStats: {},
  selection: EMPTY_SELECTION,
  find: "",
  clipboard: null,
  cutSource: null,
  canUndo: false,
  canRedo: false,

  importFile: async (path, encoding) => {
    set({
      loading: true,
      error: null,
      warnings: [],
      preview: null,
      fixedRules: [],
    });
    try {
      const response = await apiImportFile(path, encoding);
      useDirtyStore.getState().markDirty();
      set({
        dataset: response.dataset,
        preview: response.preview,
        warnings: response.warnings,
        fixedRules: response.fixed_rules,
        loading: false,
      });
    } catch (err) {
      set({
        dataset: null,
        preview: null,
        fixedRules: [],
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  fetchPage: async (offset, limit) => {
    const current = get().dataset;
    if (!current) {
      throw new Error("尚未导入数据集");
    }
    return fetchPreviewPage(current.id, offset, limit);
  },

  loadDataset: (dataset, fixedRules) => {
    set({
      dataset,
      preview: null,
      warnings: [],
      fixedRules,
      loading: false,
      error: null,
      columnStats: {},
      selection: EMPTY_SELECTION,
      clipboard: null,
      cutSource: null,
      canUndo: false,
      canRedo: false,
    });
  },

  applyEdit: async (op, payload = {}) => {
    const current = get().dataset;
    if (!current) return null;
    try {
      const response = await patchDataset(current.id, op, payload);
      useDirtyStore.getState().markDirty();
      set((state) => ({
        dataset: response.dataset ?? state.dataset,
        editVersion: state.editVersion + 1,
        columnStats: {},
        canUndo: response.can_undo,
        canRedo: response.can_redo,
        error: null,
      }));
      return response;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  undo: async () => {
    await get().applyEdit("undo");
  },

  redo: async () => {
    await get().applyEdit("redo");
  },

  reset: async () => {
    await get().applyEdit("reset");
  },

  setSelection: (selection) => {
    set({ selection });
  },

  setError: (message) => {
    set({ error: message });
  },

  selectAllCells: () => {
    set({ selection: selectAllSelection() });
  },

  setFind: (text) => {
    set({ find: text });
  },

  copySelection: (matrix) => {
    set({ clipboard: matrix, cutSource: null });
    void writeSystemClipboard(toTsv(matrix));
  },

  cutSelection: (matrix) => {
    const state = get();
    const dataset = state.dataset;
    if (dataset === null) return;
    const range = copyRangeOf(state.selection, dataset.row_count, dataset.col_count);
    set({
      clipboard: matrix,
      cutSource:
        range === null
          ? null
          : {
              rowStart: Math.min(...range.rows),
              rowEnd: Math.max(...range.rows),
              colStart: Math.min(...range.cols),
              colEnd: Math.max(...range.cols),
            },
    });
    void writeSystemClipboard(toTsv(matrix));
  },

  pasteCells: async (external) => {
    const state = get();
    const dataset = state.dataset;
    // 外部剪贴板优先（可能刚从 Excel 复制过来），否则用内部剪贴板
    const matrix = external ?? state.clipboard;
    if (dataset === null || matrix === null) {
      set({ error: "剪贴板里没有可粘贴的数据" });
      return;
    }
    const anchor = pasteAnchor(state.selection);
    const plan = planPaste(matrix, anchor, dataset.row_count, dataset.col_count);
    if (plan.cells.length === 0) {
      set({ error: "粘贴位置超出表格范围" });
      return;
    }
    // 数值列转成 number，避免把整列变成文本
    const data = matrix.slice(0, plan.rows).map((row) =>
      row.slice(0, plan.cols).map((value, index) => {
        const dtype = dataset.columns[anchor.col + index]?.dtype;
        if (dtype !== "number") return value;
        const trimmed = String(value).trim();
        if (trimmed === "") return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : value;
      }),
    );

    const cut = state.cutSource;
    if (cut !== null) {
      const overlap =
        anchor.row <= cut.rowEnd &&
        anchor.row + plan.rows - 1 >= cut.rowStart &&
        anchor.col <= cut.colEnd &&
        anchor.col + plan.cols - 1 >= cut.colStart;
      const response = await get().applyEdit("cut_paste", {
        target_row: anchor.row,
        target_col: anchor.col,
        data,
        clear_region: cut,
      });
      if (response !== null) set({ cutSource: null });
      if (overlap) set({ error: "粘贴区域与剪切来源重叠，请撤销后重试" });
      return;
    }
    await get().applyEdit("paste", {
      target_row: anchor.row,
      target_col: anchor.col,
      data,
    });
  },

  insertRows: async (count = 1, at) => {
    const state = get();
    const dataset = state.dataset;
    if (dataset === null) return;
    const anchor = selectionAnchor(state.selection);
    const requested = at ?? anchor?.row ?? dataset.row_count;
    const index = Math.max(0, Math.min(requested, dataset.row_count));
    await get().applyEdit("insert_rows", { index, count });
  },

  insertCols: async (count = 1, at) => {
    const state = get();
    const dataset = state.dataset;
    if (dataset === null) return;
    const anchor = selectionAnchor(state.selection);
    const requested = at ?? anchor?.col ?? dataset.col_count;
    const index = Math.max(0, Math.min(requested, dataset.col_count));
    await get().applyEdit("insert_cols", { index, count });
  },

  deleteRows: async () => {
    const state = get();
    const dataset = state.dataset;
    if (dataset === null) return;
    const indices = rowIndicesOf(state.selection);
    if (indices.length === 0) {
      set({ error: "先选中要删除的行（点行号）" });
      return;
    }
    await get().applyEdit("delete_rows", { indices });
    set({ selection: EMPTY_SELECTION });
  },

  deleteCols: async () => {
    const state = get();
    const dataset = state.dataset;
    if (dataset === null) return;
    const indices = colIndicesOf(state.selection);
    if (indices.length === 0) {
      set({ error: "先选中要删除的列（点列头）" });
      return;
    }
    await get().applyEdit("delete_cols", { indices });
    set({ selection: EMPTY_SELECTION });
  },

  summarizeColumns: async (fields) => {
    const current = get().dataset;
    const pending = fields.filter((field) => get().columnStats[field] === undefined);
    if (current === null || pending.length === 0) return;

    // 时间范围取「不筛」：字段不存在时退回第一列，解析失败的行全部保留
    const timeField = current.columns.some((column) => column.name === "账单时间")
      ? "账单时间"
      : (current.columns[0]?.name ?? "账单时间");

    try {
      const result = await apiCompute({
        dataset_id: current.id,
        time_range: { start: "1970-01-01", end: "2999-12-31", field: timeField },
        filters: { logic: "AND", conditions: [] },
        group_by: [],
        metrics: pending.flatMap((field, index) => [
          { id: `s${index + 1}`, field, agg: "sum" as const, alias: `sum_${index + 1}` },
          { id: `s${index + 1}_n`, field, agg: "count" as const, alias: `count_${index + 1}` },
        ]),
        derived_metrics: [],
      });
      const row = result.rows[0] ?? [];
      const patch: Record<string, { sum: number | null; count: number | null }> = {};
      pending.forEach((field, index) => {
        const sum = row[index * 2];
        const count = row[index * 2 + 1];
        patch[field] = {
          sum: typeof sum === "number" ? sum : null,
          count: typeof count === "number" ? count : null,
        };
      });
      if (get().dataset?.id !== current.id) return;
      set((state) => ({ columnStats: { ...state.columnStats, ...patch } }));
    } catch {
      // 汇总失败不影响表格本身，状态条退化成「不做数值汇总」
    }
  },
}));
