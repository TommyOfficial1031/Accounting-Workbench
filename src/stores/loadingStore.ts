/**
 * 全局「请稍候」提示（2026-10-30 第 16 轮）。
 *
 * 两处用到：
 * - 一键算点击「网点对比图表」→ 计算与图表渲染期间显示，所有图表 `finished` 后淡出；
 * - 导入表格（新建项目 / 快速导入）→ 导入期间显示，导入结束（成功或失败）后淡出。
 *
 * 用「任务 key → 文案」而不是一个布尔值：两个任务交叉时，先结束的那个不会把另一个的提示关掉；
 * 多个任务同时进行时显示最后开始的那个文案。
 */
import { create } from "zustand";

export const IMPORT_WAITING_MESSAGE = "因导入表格需要一定时间，请耐心等待...";
export const CHART_WAITING_MESSAGE = "因图表计算和渲染需要一定时间，请耐心等待...";

interface LoadingState {
  /** 正在进行的任务：key → 提示文案 */
  tasks: Record<string, string>;
  start: (key: string, message: string) => void;
  finish: (key: string) => void;
  clear: () => void;
}

export const useLoadingStore = create<LoadingState>((set) => ({
  tasks: {},

  start: (key, message) =>
    set((state) => ({ tasks: { ...state.tasks, [key]: message } })),

  finish: (key) =>
    set((state) => {
      if (!Object.prototype.hasOwnProperty.call(state.tasks, key)) return state;
      const next = { ...state.tasks };
      delete next[key];
      return { tasks: next };
    }),

  clear: () => set({ tasks: {} }),
}));

/** 当前要显示的提示：多个任务时取最后开始的那个；没有任务返回 null。 */
export function currentLoadingMessage(tasks: Record<string, string>): string | null {
  const messages = Object.values(tasks);
  return messages.length > 0 ? messages[messages.length - 1] : null;
}
