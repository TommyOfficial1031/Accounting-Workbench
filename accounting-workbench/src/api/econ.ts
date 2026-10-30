import { request } from "./client";
import type {
  BoardDimSources,
  BoardRequest,
  BoardResult,
  RegressionManualConfig,
  RegressionManualResult,
  RegressionTableRequest,
  RegressionTableResult,
  ValuesResult,
} from "../types/api";

/** 数据集字段候选值（分组筛选条件的下拉框用）；传 parent/child 时另带「父值 → 子值集合」。 */
export async function fetchValues(
  datasetId: string,
  fields: string[],
  limit = 200,
  cascade?: { parent: string; child: string },
): Promise<ValuesResult> {
  return request<ValuesResult>("/api/values", {
    method: "POST",
    body: {
      dataset_id: datasetId,
      fields,
      limit,
      ...(cascade === undefined
        ? {}
        : { parent_field: cascade.parent, child_field: cascade.child }),
    },
  });
}

/** 一键算：按筛选条件汇总 6 个公斤段。 */
export async function buildBoard(payload: BoardRequest): Promise<BoardResult> {
  return request<BoardResult>("/api/board", { method: "POST", body: payload });
}

/** 一键算：维度候选值（省份跟随已选网点）。 */
export async function fetchBoardSources(payload: {
  dataset_id: string;
  nets?: string[];
  exclude?: string;
  source?: string;
}): Promise<BoardDimSources> {
  return request<BoardDimSources>("/api/board/sources", { method: "POST", body: payload });
}

/** 盈亏平衡：手动测算。 */
export async function runManual(
  config: RegressionManualConfig,
): Promise<RegressionManualResult> {
  return request<RegressionManualResult>("/api/regression/manual", {
    method: "POST",
    body: { config },
  });
}

/** 盈亏平衡：表格取数。 */
export async function runTable(payload: RegressionTableRequest): Promise<RegressionTableResult> {
  return request<RegressionTableResult>("/api/regression/table", {
    method: "POST",
    body: payload,
  });
}

export interface ExportFolderResult {
  folder: string;
  files: string[];
}

/** 盈亏平衡：导出四件套（表格取数模式）。 */
export async function exportRegressionTable(payload: {
  result: RegressionTableResult;
  out_dir: string;
  stamp: string;
  prefix: string;
}): Promise<ExportFolderResult> {
  return request<ExportFolderResult>("/api/regression/export/table", {
    method: "POST",
    body: payload,
  });
}

/** 盈亏平衡：导出四件套（手动测算模式）。 */
export async function exportRegressionManual(payload: {
  config: RegressionManualConfig;
  out_dir: string;
  stamp: string;
  prefix?: string;
}): Promise<ExportFolderResult> {
  return request<ExportFolderResult>("/api/regression/export/manual", {
    method: "POST",
    body: payload,
  });
}
