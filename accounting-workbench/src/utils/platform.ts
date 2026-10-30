import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

// Tauri 2 用 __TAURI_INTERNALS__ 标记（Tauri 1 才是 window.__TAURI__）。
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 调用 Rust 侧命令（打开文件 / 打开路径等）；非 Tauri 环境直接抛错。 */
export async function invokeCommand<T = void>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!isTauri()) throw new Error(`非桌面环境无法执行：${command}`);
  return invoke<T>(command, args);
}

// 弹出保存对话框拿路径；非 Tauri 环境返回 null（调用方改用浏览器下载）。
export async function pickSavePath(
  defaultPath: string,
  extension: string,
): Promise<string | null> {
  if (!isTauri()) return null;
  return save({
    defaultPath,
    filters: [{ name: "文件", extensions: [extension] }],
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// 打开文件选择对话框拿路径；非 Tauri 环境返回 null（调用方改用路径输入）。
export async function pickOpenPath(): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "表格文件", extensions: ["xlsx", "xls", "csv"] }],
  });
  return typeof selected === "string" ? selected : null;
}

/** 选择一个目录（导出文件夹用）；浏览器环境返回 null。 */
export async function pickDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") return selected;
    return null;
  } catch {
    return null;
  }
}

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
}

export function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
