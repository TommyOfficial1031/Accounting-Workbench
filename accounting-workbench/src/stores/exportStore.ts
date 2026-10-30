import { create } from "zustand";
import {
  clearExportRecords,
  createExportRecord,
  deleteExportRecord,
  listExportRecords,
} from "../api/exports";
import type { ExportRecord } from "../types/api";
import { invokeCommand, isTauri } from "../utils/platform";
import { getCurrentProjectRef } from "./projectRef";

/** 导出文件管理：记录每次导出的文件名、时间、归属项目、创建人、路径。 */

interface ExportState {
  records: ExportRecord[];
  query: string;
  loading: boolean;
  error: string | null;
  load: (query?: string) => Promise<void>;
  setQuery: (query: string) => void;
  /** 导出成功后登记；失败不影响导出本身（只记 console）。 */
  record: (payload: {
    path: string;
    kind: "file" | "folder";
    name: string;
  }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  /** 用系统默认程序打开文件；没有关联程序时退化成「在资源管理器里选中」。 */
  openFile: (path: string) => Promise<string>;
  /** 打开所在文件夹（文件夹本身则直接进入）。 */
  openFolder: (path: string) => Promise<string>;
}

export const useExportStore = create<ExportState>((set, get) => ({
  records: [],
  query: "",
  loading: false,
  error: null,

  load: async (query) => {
    set({ loading: true, error: null });
    try {
      const response = await listExportRecords(query ?? get().query);
      set({ records: response.items, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  setQuery: (query) => set({ query }),

  record: async ({ path, kind, name }) => {
    const project = getCurrentProjectRef();
    try {
      await createExportRecord({
        name,
        kind,
        path,
        project_id: project.id,
        project_name: project.name,
        creator: project.creator,
      });
      await get().load();
    } catch (err) {
      // 记录失败不能影响已经成功的导出
      console.warn("[export] 记录导出失败", err);
    }
  },

  remove: async (id) => {
    try {
      await deleteExportRecord(id);
      set((state) => ({ records: state.records.filter((item) => item.id !== id) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  clear: async () => {
    try {
      await clearExportRecords();
      set({ records: [] });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  openFile: async (path) => {
    if (!isTauri()) return `浏览器环境无法打开文件：${path}`;
    try {
      await invokeCommand("open_file", { path });
      return `已打开：${path}`;
    } catch (err) {
      return `打开失败：${err instanceof Error ? err.message : String(err)}`;
    }
  },

  openFolder: async (path) => {
    if (!isTauri()) return `浏览器环境无法打开路径：${path}`;
    try {
      await invokeCommand("open_folder", { path });
      return `已打开：${path}`;
    } catch (err) {
      return `打开失败：${err instanceof Error ? err.message : String(err)}`;
    }
  },
}));
