/**
 * 全局「请稍候」遮罩（2026-10-30 第 16 轮）。
 *
 * 表现：整屏变暗 + 居中提示卡 + 转圈；提示期间界面不可操作（点击被遮罩吃掉、键盘事件被拦），
 * 任务结束后**淡出**（保留 240ms 过渡再卸载）。
 *
 * 状态来自 `stores/loadingStore.ts`；挂载在 `App.tsx` 根部，用 portal 盖到所有弹窗之上。
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { currentLoadingMessage, useLoadingStore } from "../../stores/loadingStore";
import styles from "./LoadingOverlay.module.css";

/** 与 CSS 的 opacity 过渡时长一致。 */
const FADE_MS = 240;

function LoadingOverlay() {
  const tasks = useLoadingStore((state) => state.tasks);
  const message = currentLoadingMessage(tasks);
  const [visibleMessage, setVisibleMessage] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<number | null>(null);

  /* 有任务 → 立刻出现（清掉可能正在进行的淡出）；任务全部结束 → 进入淡出 */
  useEffect(() => {
    if (message !== null) {
      if (fadeTimer.current !== null) {
        window.clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }
      setVisibleMessage(message);
      setFading(false);
      return;
    }
    if (visibleMessage === null) return;
    setFading(true);
    fadeTimer.current = window.setTimeout(() => {
      setVisibleMessage(null);
      setFading(false);
      fadeTimer.current = null;
    }, FADE_MS);
  }, [message, visibleMessage]);

  /* 提示期间键盘也拦住（Ctrl+S / 快捷键不能在后台触发） */
  useEffect(() => {
    if (visibleMessage === null) return;
    const block = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, [visibleMessage]);

  /* 卸载时清掉淡出定时器，避免 setState after unmount */
  useEffect(
    () => () => {
      if (fadeTimer.current !== null) {
        window.clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }
    },
    [],
  );

  if (visibleMessage === null || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`${styles.mask}${fading ? ` ${styles.fading}` : ""}`}
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={visibleMessage}
    >
      <div className={styles.card}>
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.text}>{visibleMessage}</p>
      </div>
    </div>,
    document.body,
  );
}

export default LoadingOverlay;
