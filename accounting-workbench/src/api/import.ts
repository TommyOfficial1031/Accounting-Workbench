import { request } from "./client";
import type { ImportResponse, PreviewPage, TimeRangeInfo } from "../types/api";

export async function importFile(
  path: string,
  encoding?: string,
): Promise<ImportResponse> {
  return request<ImportResponse>("/api/import", {
    method: "POST",
    body: { path, encoding: encoding ?? null },
  });
}

export async function fetchPreviewPage(
  datasetId: string,
  offset: number,
  limit: number,
): Promise<PreviewPage> {
  const id = encodeURIComponent(datasetId);
  return request<PreviewPage>(
    `/api/dataset/${id}/preview?offset=${offset}&limit=${limit}`,
  );
}

/** 自动识别数据集的时间字段与 min~max 日期（第 11 轮 C）。 */
export async function fetchTimeRange(datasetId: string): Promise<TimeRangeInfo> {
  const id = encodeURIComponent(datasetId);
  return request<TimeRangeInfo>(`/api/dataset/${id}/time-range`);
}
