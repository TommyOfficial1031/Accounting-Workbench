import { create } from "zustand";

import {
  buildBoard,
  exportRegressionManual,
  exportRegressionTable,
  fetchBoardSources,
  fetchValues,
  runManual,
  runTable,
} from "../api/econ";
import type {
  BoardDimSources,
  BoardRequest,
  BoardResult,
  RegressionManualConfig,
  RegressionManualResult,
  RegressionTableRequest,
  RegressionTableResult,
} from "../types/api";
import { useExportStore } from "./exportStore";

export interface BoardInputs {
  nets: string[];
  exclude: string;
  source: string;
  dims: Array<"网点" | "省份">;
  /** 二级取值：dim -> 勾选的字段值（空 = 全部） */
  dimValues: Record<string, string[]>;
}

export interface PolicyDraft {
  c_line: string;
  op_cost: string;
  d_plan: string;
  z_plan: string;
}

export interface RegressionInputs {
  mode: "table" | "manual";
  manual: RegressionManualConfig;
  /** 手动测算里拆开输入的「车线成本 / 操作成本」（C = 两者之和），随项目快照保存。 */
  cLine: string;
  opCost: string;
  dims: string[];
  picks: Record<string, string[]>;
  /** 级联勾选：父字段（目的所属省份）→ 省份 → 该省勾选的公斤段（第 11 轮 A①） */
  cascade: Record<string, Record<string, string[]>>;
  policies: Record<string, PolicyDraft>;
}

export const DEFAULT_BOARD_INPUTS: BoardInputs = {
  nets: [],
  exclude: "不剔除",
  source: "普通物品",
  // 前端只提供「网点 / 网点 × 省份」，默认网点 × 省份（后端仍认「省份」以兼容老快照）
  dims: ["网点", "省份"],
  dimValues: {},
};

export function defaultRegressionInputs(datasetPresent: boolean): RegressionInputs {
  return {
    mode: datasetPresent ? "table" : "manual",
    manual: {
      p0: 0.8,
      d: 0.85,
      d_plan: 0.7,
      b_now: 3000,
      b_plan: 2000,
      c: 0.38,
      z_now: 120000,
      z_plan: 150000,
    },
    cLine: "0.18",
    opCost: "0.08",
    dims: ["寄件所属一级网点"],
    picks: {},
    cascade: {},
    policies: {},
  };
}

interface EconState {
  manual: RegressionManualResult | null;
  table: RegressionTableResult | null;
  board: BoardResult | null;
  sources: BoardDimSources | null;
  values: Record<string, string[]>;
  /** 级联候选取值：省份 → 该省出现过的公斤段（第 11 轮 A①） */
  cascadeValues: Record<string, string[]>;
  loading: boolean;
  error: string | null;
  boardInputs: BoardInputs;
  regressionInputs: RegressionInputs;
  setBoardInputs: (patch: Partial<BoardInputs>) => void;
  setRegressionInputs: (patch: Partial<RegressionInputs>) => void;
  hydrate: (snapshot: {
    board?: BoardInputs;
    regression?: RegressionInputs;
  }) => void;

  runManualModel: (config: RegressionManualConfig) => Promise<void>;
  runTableModel: (payload: RegressionTableRequest) => Promise<void>;
  runBoard: (payload: BoardRequest) => Promise<void>;
  loadSources: (payload: {
    dataset_id: string;
    nets?: string[];
    exclude?: string;
    source?: string;
  }) => Promise<void>;
  loadValues: (
    datasetId: string,
    fields: string[],
    cascade?: { parent: string; child: string },
  ) => Promise<void>;
  exportTable: (outDir: string, stamp: string, prefix: string) => Promise<string | null>;
  exportManual: (config: RegressionManualConfig, outDir: string, stamp: string) => Promise<string | null>;
  reset: () => void;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useEconStore = create<EconState>((set, get) => ({
  manual: null,
  table: null,
  board: null,
  sources: null,
  values: {},
  cascadeValues: {},
  loading: false,
  error: null,
  boardInputs: { ...DEFAULT_BOARD_INPUTS },
  regressionInputs: defaultRegressionInputs(false),

  setBoardInputs: (patch) => set((state) => ({ boardInputs: { ...state.boardInputs, ...patch } })),
  setRegressionInputs: (patch) =>
    set((state) => ({ regressionInputs: { ...state.regressionInputs, ...patch } })),
  hydrate: (snapshot) =>
    set((state) => ({
      boardInputs: snapshot.board ?? state.boardInputs,
      regressionInputs: snapshot.regression ?? state.regressionInputs,
    })),

  runManualModel: async (config) => {
    set({ loading: true, error: null });
    try {
      const manual = await runManual(config);
      set({ manual, loading: false });
    } catch (err) {
      set({ error: messageOf(err), loading: false });
    }
  },

  runTableModel: async (payload) => {
    set({ loading: true, error: null });
    try {
      const table = await runTable(payload);
      set({ table, loading: false });
    } catch (err) {
      set({ error: messageOf(err), loading: false });
    }
  },

  runBoard: async (payload) => {
    set({ loading: true, error: null });
    try {
      const board = await buildBoard(payload);
      set({ board, loading: false });
    } catch (err) {
      set({ error: messageOf(err), loading: false });
    }
  },

  loadSources: async (payload) => {
    try {
      const sources = await fetchBoardSources(payload);
      set({ sources });
    } catch (err) {
      set({ error: messageOf(err) });
    }
  },

  loadValues: async (datasetId, fields, cascade) => {
    if (fields.length === 0) return;
    try {
      const result = await fetchValues(datasetId, fields, 200, cascade);
      set((state) => ({
        values: { ...state.values, ...result.values },
        cascadeValues:
          result.cascade === undefined ? state.cascadeValues : { ...result.cascade },
      }));
    } catch (err) {
      set({ error: messageOf(err) });
    }
  },

  exportTable: async (outDir, stamp, prefix) => {
    const table = get().table;
    if (table === null) {
      set({ error: "还没有计算结果，先点「计算」" });
      return null;
    }
    set({ loading: true, error: null });
    try {
      const result = await exportRegressionTable({ result: table, out_dir: outDir, stamp, prefix });
      set({ loading: false });
      await recordFolderExport(result.folder, result.files.length);
      return `已导出 ${result.files.length} 个文件到 ${result.folder}`;
    } catch (err) {
      set({ error: messageOf(err), loading: false });
      return null;
    }
  },

  exportManual: async (config, outDir, stamp) => {
    set({ loading: true, error: null });
    try {
      const result = await exportRegressionManual({ config, out_dir: outDir, stamp });
      set({ loading: false });
      await recordFolderExport(result.folder, result.files.length);
      return `已导出 ${result.files.length} 个文件到 ${result.folder}`;
    } catch (err) {
      set({ error: messageOf(err), loading: false });
      return null;
    }
  },

  reset: () => set({ manual: null, table: null, board: null, error: null, cascadeValues: {} }),
}));

/** 盈亏平衡导出的是文件夹：按用户要求记 1 条（kind = folder）。 */
async function recordFolderExport(folder: string, fileCount: number): Promise<void> {
  const name = folder.split(/[\\/]/).filter(Boolean).pop() ?? folder;
  await useExportStore.getState().record({
    path: folder,
    kind: "folder",
    name: `${name}（${fileCount} 个文件）`,
  });
}
