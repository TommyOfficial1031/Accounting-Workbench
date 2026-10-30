/**
 * 拖入文件的支持判断与事件去重。
 *
 * 首页「将文件拖到此处创建新项目」走的是 Tauri 的拖放事件：同一次拖放会从两条通道各来一次
 * （webview 的 `tauri://drag-drop` + Rust 侧兜底的 `aw://file-dropped`），所以要去重。
 */

const TABLE_EXTENSION = /\.(xlsx|xls|csv)$/i;

/** 路径里的文件名（兼容 Windows 反斜杠与 macOS 斜杠）。 */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? "";
}

/** 从拖入的路径里挑出第一个 xlsx / xls / csv；都不支持返回 null。 */
export function firstTableFile(paths: readonly string[]): string | null {
  for (const path of paths) {
    if (TABLE_EXTENSION.test(fileNameOf(path))) return path;
  }
  return null;
}

/** 短时间去重：同一条路径在 windowMs 内只放行一次（`now` 可注入，测试用）。 */
export function createDropDedupe(
  windowMs = 1500,
  now: () => number = () => Date.now(),
): (path: string) => boolean {
  const seen = new Map<string, number>();
  return (path: string): boolean => {
    const stamp = now();
    const last = seen.get(path);
    if (last !== undefined && stamp - last < windowMs) return false;
    seen.set(path, stamp);
    return true;
  };
}
