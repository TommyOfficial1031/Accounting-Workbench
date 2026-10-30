import { getBackendPort } from "./client";
import type { ChartConfig, ComputeResult } from "../types/api";

export type ExportFormat = "pdf" | "jpeg";

async function postChart(
  result: ComputeResult,
  chart: ChartConfig,
  format: ExportFormat,
  path: string | null,
): Promise<Response> {
  const port = await getBackendPort();
  const figsize = chart.chart_type === "pie" ? [8, 8] : [10, 6];
  return fetch(`http://127.0.0.1:${port}/api/chart/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      result,
      chart,
      format,
      render_opts: { figsize, dpi: 300, quality: 90, optimize: true },
      path,
    }),
  });
}

async function throwExportError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  throw new Error(body?.error?.message ?? `导出失败 (${response.status})`);
}

/** 浏览器降级：返回二进制流。 */
export async function renderChart(
  result: ComputeResult,
  chart: ChartConfig,
  format: ExportFormat,
): Promise<Blob> {
  const response = await postChart(result, chart, format, null);
  if (!response.ok) await throwExportError(response);
  return response.blob();
}

/** 桌面端：后端直接把图写到用户选的路径，返回最终路径。 */
export async function renderChartToPath(
  result: ComputeResult,
  chart: ChartConfig,
  format: ExportFormat,
  path: string,
): Promise<string> {
  const response = await postChart(result, chart, format, path);
  if (!response.ok) await throwExportError(response);
  const body = (await response.json()) as { path?: string };
  return body.path ?? path;
}
