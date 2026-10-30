/**
 * 一键算「网点对比图表」的文件夹导出接口（1 张合并大图 + N 张拆分小图）。
 *
 * 只做 HTTP 调用与错误转换（src/AGENTS.md：api/ 只做 HTTP）；
 * 组装逻辑在 utils/boardChartExport.ts，后端在 routers/board_export_router.py。
 */
import { request } from "./client";
import type { ChartConfig, ComputeResult } from "../types/api";

export type BoardChartFolderFormat = "pdf" | "jpeg";

/** 后端 schemas/chart.py::RenderOpts 的对应结构。 */
export interface BoardRenderOpts {
  figsize?: [number, number];
  dpi?: number;
  quality?: number;
  optimize?: boolean;
}

export interface BoardChartJobPayload {
  result: ComputeResult;
  chart: ChartConfig;
  render_opts?: BoardRenderOpts;
}

export interface BoardChartFolderRequest {
  merged: BoardChartJobPayload;
  splits: BoardChartJobPayload[];
  /** 用户选择的父目录（导出文件夹建在它下面） */
  out_dir: string;
  /** 时间戳，形如 `2026-10-29 11：38`（全角冒号） */
  stamp: string;
  /** 文件名主体 = 合并大图名（不含时间戳与扩展名），也用作文件夹名 */
  folder_base: string;
  /** [大图, ...N 张小图] 的文件名（不含扩展名） */
  file_names: string[];
  format: BoardChartFolderFormat;
  /** 单张图没带 render_opts 时的兜底渲染参数 */
  render_opts?: BoardRenderOpts;
}

export interface BoardChartFolderResponse {
  folder: string;
  files: string[];
}

/** 写一个文件夹并返回清单；失败时抛出带后端中文消息的 ApiError。 */
export async function exportBoardChartFolder(
  payload: BoardChartFolderRequest,
): Promise<BoardChartFolderResponse> {
  return request<BoardChartFolderResponse>("/api/board/export/chart-folder", {
    method: "POST",
    body: payload,
  });
}
