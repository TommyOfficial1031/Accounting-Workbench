import { create } from "zustand";
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  getProject as apiGetProject,
  listProjects as apiListProjects,
  mergeProjects as apiMergeProjects,
  queryProjects as apiQueryProjects,
  saveProject as apiSaveProject,
  type MergePayload,
  type ProjectQuery,
} from "../api/project";
import type {
  AnalysisConfig,
  ComputeResult,
  MergeResponse,
  Project,
  ProjectListResponse,
  ProjectSummary,
} from "../types/api";
import { useAnalysisStore } from "./analysisStore";
import { useChartStore } from "./chartStore";
import { useDirtyStore } from "./dirtyStore";
import { useEconStore } from "./econStore";
import { useTableStore } from "./tableStore";
import { isSnapshot, type ProjectStateSnapshot } from "../utils/pageState";
import { cloneMetricBoxes } from "../utils/analysisRows";
import { normalizeChartConfig } from "../utils/chartData";
import { setCurrentProjectRef } from "./projectRef";

/** 收集三个工具页的输入快照（只存输入，不存结果）。 */
function collectSnapshot(): ProjectStateSnapshot {
  const chart = useChartStore.getState().config;
  const econ = useEconStore.getState();
  const analysis = useAnalysisStore.getState();
  return {
    analysis: {
      chart: { ...chart },
      filterRows: analysis.filterRows.map((row) => ({ ...row })),
      metricBoxes: cloneMetricBoxes(analysis.metricBoxes),
      timePreset: analysis.timePreset,
      timeStart: analysis.timeRange?.start ?? "",
      timeEnd: analysis.timeRange?.end ?? "",
    },
    board: { ...econ.boardInputs },
    regression: {
      mode: econ.regressionInputs.mode,
      manual: { ...econ.regressionInputs.manual },
      cLine: econ.regressionInputs.cLine,
      opCost: econ.regressionInputs.opCost,
      dims: [...econ.regressionInputs.dims],
      picks: { ...econ.regressionInputs.picks },
      // 级联勾选（省份 → 该省公斤段）也要进快照，否则重开项目公斤段全丢
      cascade: { ...econ.regressionInputs.cascade },
      policies: { ...econ.regressionInputs.policies },
    },
  };
}

/** 打开项目后回填三个工具页的输入。 */
function applySnapshot(raw: unknown): void {
  if (!isSnapshot(raw)) return;
  const snapshot = raw;
  if (snapshot.analysis?.chart) {
    // 老项目只存了单字段 X 轴（x_axis + x_values），这里统一升成 x_dims
    const patch = normalizeChartConfig(snapshot.analysis.chart);
    if (Object.keys(patch).length > 0) useChartStore.getState().updateConfig(patch);
  }
  if (snapshot.analysis?.filterRows && (snapshot.analysis.metricBoxes || snapshot.analysis.metricRows)) {
    useAnalysisStore.getState().restoreRows({
      filterRows: snapshot.analysis.filterRows,
      metricBoxes: snapshot.analysis.metricBoxes,
      metricRows: snapshot.analysis.metricRows,
      timePreset: snapshot.analysis.timePreset,
      start: snapshot.analysis.timeStart,
      end: snapshot.analysis.timeEnd,
    });
  }
  const econ = useEconStore.getState();
  if (snapshot.board) econ.setBoardInputs(snapshot.board);
  if (snapshot.regression) {
    // 老快照没有 cascade：显式给空对象，避免沿用上一个项目的级联勾选
    econ.setRegressionInputs({ ...snapshot.regression, cascade: snapshot.regression.cascade ?? {} });
  }
}

interface ProjectState {
  projects: ProjectSummary[];
  currentProject: Project | null;
  recentProjects: ProjectSummary[];
  loading: boolean;
  error: string | null;
  listProjects: () => Promise<void>;
  fetchRecent: () => Promise<void>;
  queryHistory: (params: ProjectQuery) => Promise<ProjectListResponse | null>;
  createProject: (name: string, creator: string, sourcePath: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  /** 启动时自动打开最近一次打开过的项目；无历史或打开失败返回 false。 */
  openLastProject: () => Promise<boolean>;
  saveCurrentProject: (
    config: AnalysisConfig,
    result: ComputeResult | null,
    savedKind?: "manual" | "auto",
  ) => Promise<void>;
  saveCurrent: () => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  mergeProjects: (payload: MergePayload) => Promise<MergeResponse | null>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  recentProjects: [],
  loading: false,
  error: null,

  listProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await apiListProjects();
      set({ projects, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  fetchRecent: async () => {
    try {
      const response = await apiQueryProjects({ limit: 5, order_by: "updated_at" });
      set({ recentProjects: response.items });
    } catch {
      set({ recentProjects: [] });
    }
  },

  queryHistory: async (params) => {
    try {
      return await apiQueryProjects(params);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  createProject: async (name, creator, sourcePath) => {
    set({ loading: true, error: null });
    try {
      const detail = await apiCreateProject({ name, creator, source_path: sourcePath });
      set({ currentProject: detail.project, loading: false });
      setCurrentProjectRef({
        id: detail.project.id,
        name: detail.project.name,
        creator: detail.project.creator,
      });
      useTableStore.getState().loadDataset(detail.dataset, detail.fixed_rules);
      useAnalysisStore.getState().restore(null, detail.dataset, detail.project.name, null);
      useDirtyStore.getState().clearDirty();
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  openProject: async (id) => {
    set({ loading: true, error: null });
    try {
      const detail = await apiGetProject(id);
      set({ currentProject: detail.project, loading: false });
      setCurrentProjectRef({
        id: detail.project.id,
        name: detail.project.name,
        creator: detail.project.creator,
      });
      useTableStore.getState().loadDataset(detail.dataset, detail.fixed_rules);
      useAnalysisStore.getState().restore(
        detail.project.analysis_config,
        detail.dataset,
        detail.project.name,
        detail.result,
      );
      applySnapshot(detail.project.state);
      useDirtyStore.getState().clearDirty();
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  openLastProject: async () => {
    try {
      const response = await apiQueryProjects({ limit: 1, order_by: "updated_at" });
      const last = response.items[0];
      if (last === undefined) return false;
      await get().openProject(last.id);
      return useTableStore.getState().dataset !== null;
    } catch {
      return false;
    }
  },

  saveCurrentProject: async (config, result, savedKind = "manual") => {
    const id = get().currentProject?.id;
    if (!id) return;
    try {
      const updated = await apiSaveProject(id, {
        analysis_config: config,
        result,
        state: collectSnapshot() as unknown as Record<string, unknown>,
        saved_kind: savedKind,
      });
      set({ currentProject: updated });
      useDirtyStore.getState().clearDirty();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  saveCurrent: async () => {
    const id = get().currentProject?.id;
    if (!id) return "请先创建或打开项目";
    const config = useAnalysisStore.getState().buildConfig();
    if (!config) return "请先完成分析配置";
    const result = useAnalysisStore.getState().result;
    await get().saveCurrentProject(config, result);
    return "已保存";
  },

  deleteProject: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiDeleteProject(id);
      set((state) => ({
        projects: state.projects.filter((project) => project.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject,
        loading: false,
      }));
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  mergeProjects: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiMergeProjects(payload);
      set({ loading: false });
      if (!payload.dry_run) {
        await get().listProjects();
      }
      return response;
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },
}));
