import { request } from "./client";
import type { DatasetMeta } from "../types/api";

export interface EditPayload {
  cells?: { row: number; col: number; value: unknown }[];
  target_row?: number;
  target_col?: number;
  data?: unknown[][];
  row_start?: number;
  row_end?: number;
  col_start?: number;
  col_end?: number;
  index?: number;
  count?: number;
  names?: string[];
  indices?: number[];
  [key: string]: unknown;
}

export type EditOp =
  | "set_cells"
  | "paste"
  | "cut_paste"
  | "cut"
  | "insert_rows"
  | "insert_cols"
  | "delete_rows"
  | "delete_cols"
  | "undo"
  | "redo"
  | "reset";

export interface EditResponse {
  success: boolean;
  row_count: number;
  col_count: number;
  warnings: string[];
  can_undo: boolean;
  can_redo: boolean;
  dataset: DatasetMeta | null;
}

export async function patchDataset(
  datasetId: string,
  op: EditOp,
  payload: EditPayload = {},
  idempotencyKey?: string,
): Promise<EditResponse> {
  return request<EditResponse>(`/api/dataset/${encodeURIComponent(datasetId)}`, {
    method: "PATCH",
    body: { op, payload, idempotency_key: idempotencyKey ?? null },
  });
}
