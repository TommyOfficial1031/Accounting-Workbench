import { request } from "./client";
import type { ExportRecord, ExportRecordCreate, ExportRecordList } from "../types/api";

/** 导出记录列表（按导出时间倒序）。 */
export async function listExportRecords(query?: string, limit = 200): Promise<ExportRecordList> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query !== undefined && query.trim() !== "") params.set("query", query.trim());
  return request<ExportRecordList>(`/api/exports?${params.toString()}`);
}

/** 登记一次导出（导出成功后调用）。 */
export async function createExportRecord(payload: ExportRecordCreate): Promise<ExportRecord> {
  return request<ExportRecord>("/api/exports", { method: "POST", body: payload });
}

export async function deleteExportRecord(id: string): Promise<boolean> {
  const response = await request<{ deleted: boolean }>(
    `/api/exports/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return response.deleted;
}

export async function clearExportRecords(): Promise<number> {
  const response = await request<{ deleted: number }>("/api/exports", { method: "DELETE" });
  return response.deleted;
}
