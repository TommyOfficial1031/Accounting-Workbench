import { request } from "./client";
import type { AnalysisConfig, ComputeResult } from "../types/api";

export async function compute(config: AnalysisConfig): Promise<ComputeResult> {
  return request<ComputeResult>("/api/compute", {
    method: "POST",
    body: config,
  });
}
