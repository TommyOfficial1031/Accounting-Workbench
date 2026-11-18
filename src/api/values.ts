import { request } from "./client";
import type { TimeRangePayload } from "../types/api";

export interface ValuesRequest {
  dataset_id: string;
  fields: string[];
  limit?: number;
  time_range?: TimeRangePayload | null;
}

export interface ValuesResponse {
  values: Record<string, string[]>;
}

/** 字段候选取值（可按时间范围收窄）；返回值里空列表表示该字段在范围内没有数据。 */
export async function fetchValues(payload: ValuesRequest): Promise<Record<string, string[]>> {
  const response = await request<ValuesResponse>("/api/values", {
    method: "POST",
    body: payload,
  });
  return response.values;
}
