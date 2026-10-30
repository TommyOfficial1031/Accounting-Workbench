import { request } from "./client";
import type {
  AnalysisConfig,
  ComputeResult,
  MergeResponse,
  Project,
  ProjectDetail,
  ProjectListResponse,
  ProjectSummary,
} from "../types/api";

export interface MergePayload {
  project_ids: string[];
  base_id?: string | null;
  dry_run?: boolean;
  name?: string | null;
}

export interface ProjectQuery {
  name?: string;
  creator?: string;
  created_from?: string;
  created_to?: string;
  order_by?: string;
  offset?: number;
  limit?: number;
}

export async function createProject(payload: {
  name: string;
  creator: string;
  source_path: string;
}): Promise<ProjectDetail> {
  return request("/api/projects", { method: "POST", body: payload });
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const response = await request<ProjectListResponse>("/api/projects");
  return response.items;
}

export async function queryProjects(params: ProjectQuery): Promise<ProjectListResponse> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return request<ProjectListResponse>(`/api/projects${qs ? `?${qs}` : ""}`);
}

export async function getProject(id: string): Promise<ProjectDetail> {
  return request(`/api/projects/${encodeURIComponent(id)}`);
}

export async function saveProject(
  id: string,
  payload: {
    analysis_config: AnalysisConfig;
    result: ComputeResult | null;
    /** 三个工具页的输入快照（分析图表 / 一键算 / 盈亏平衡）。 */
    state?: Record<string, unknown> | null;
    /** manual = 点保存；auto = 未保存直接退出的自动保存。 */
    saved_kind?: "manual" | "auto";
  },
): Promise<Project> {
  return request(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteProject(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function mergeProjects(payload: MergePayload): Promise<MergeResponse> {
  return request("/api/projects/merge", { method: "POST", body: payload });
}