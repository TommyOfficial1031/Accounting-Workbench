import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../../utils/platform";
import styles from "./TitleBar.module.css";
import appIcon from "../../assets/app-icon.png";

/** 自绘窗口标题栏（用户反馈第 10 条：去掉系统标题栏，做成 DSH 那样）。
 *
 * - 拖动：`data-tauri-drag-region`（Tauri 原生支持，双击最大化）
 * - 最小化 / 最大化 / 关闭：@tauri-apps/api/window
 * - 无边框窗口没有系统边框，四周再放 8 个透明拉伸热区
 */
function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const desktop = isTauri();

  useEffect(() => {
    if (!desktop) return;
    const win = getCurrentWindow();
    let alive = true;
    const sync = async (): Promise<void> => {
      const value = await win.isMaximized();
      if (alive) setMaximized(value);
    };
    void sync();
    const unlisten = win.onResized(() => void sync());
    return () => {
      alive = false;
      void unlisten.then((off) => off());
    };
  }, [desktop]);

  if (!desktop) return null;

  const win = getCurrentWindow();

  return (
    <>
      <div className={styles.bar} data-tauri-drag-region>
        <div className={styles.brand} data-tauri-drag-region>
          {/* 标题栏小方块 = 应用图标 */}
          <img className={styles.dot} src={appIcon} alt="" aria-hidden="true" />
          算账工作台
        </div>
        <div className={styles.spacer} data-tauri-drag-region />
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.control}
            title="最小化"
            onClick={() => void win.minimize()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 5h6" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            type="button"
            className={styles.control}
            title={maximized ? "还原" : "最大化"}
            onClick={() => void win.toggleMaximize()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect
                x="2"
                y="2"
                width="6"
                height="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
              />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.control} ${styles.close}`}
            title="关闭"
            onClick={() => void win.close()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2.6 2.6l4.8 4.8M7.4 2.6l-4.8 4.8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>

      {/* 无边框窗口的四边/四角拉伸热区 */}
      <div className={styles.resizeN} onMouseDown={() => void win.startResizeDragging("North")} />
      <div className={styles.resizeS} onMouseDown={() => void win.startResizeDragging("South")} />
      <div className={styles.resizeW} onMouseDown={() => void win.startResizeDragging("West")} />
      <div className={styles.resizeE} onMouseDown={() => void win.startResizeDragging("East")} />
      <div
        className={styles.resizeNW}
        onMouseDown={() => void win.startResizeDragging("NorthWest")}
      />
      <div
        className={styles.resizeNE}
        onMouseDown={() => void win.startResizeDragging("NorthEast")}
      />
      <div
        className={styles.resizeSW}
        onMouseDown={() => void win.startResizeDragging("SouthWest")}
      />
      <div
        className={styles.resizeSE}
        onMouseDown={() => void win.startResizeDragging("SouthEast")}
      />
    </>
  );
}

export default TitleBar;
