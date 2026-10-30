import { getBackendPort } from "./client";
import type { ComputeResult } from "../types/api";

export type ExportFormat = "xlsx" | "xls" | "csv";

async function _parseError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return new Error(body?.error?.message ?? `导出失败 (${response.status})`);
}

// Tauri 模式：后端写盘到用户选择的路径。
export async function exportTableToPath(
  result: ComputeResult,
  format: ExportFormat,
  path: string,
): Promise<void> {
  const port = await getBackendPort();
  const response = await fetch(`http://127.0.0.1:${port}/api/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result, format, path }),
  });
  if (!response.ok) throw await _parseError(response);
}

// 浏览器降级：后端返回字节流。
export async function exportTableBytes(
  result: ComputeResult,
  format: ExportFormat,
  filename: string,
): Promise<Blob> {
  const port = await getBackendPort();
  const response = await fetch(`http://127.0.0.1:${port}/api/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result, format, filename }),
  });
  if (!response.ok) throw await _parseError(response);
  return response.blob();
}
