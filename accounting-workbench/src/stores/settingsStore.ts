import { create } from "zustand";
import { fetchSettings, updateDataDir } from "../api/settings";
import type { AppSettings, DataDirMigration } from "../types/api";

/** 外观设置：主题 + 字号（localStorage 持久化，重启保留）。
 *
 * 数据目录（2026-10-28 需求 11）走后端 ``/api/settings``：目录本身与迁移由 Python 侧
 * 负责（项目库 / parquet 缓存 / 导出记录都在那儿），前端只显示与触发。
 */

export type Theme = "light" | "dark";

export const FONT_SCALES = [0.9, 1, 1.1, 1.2] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export interface DataDirChangeResult {
  ok: boolean;
  message: string;
}

const STORAGE_KEY = "aw:settings";

interface Persisted {
  theme: Theme;
  scale: FontScale;
}

function readPersisted(): Persisted {
  const fallback: Persisted = { theme: "light", scale: 1 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const theme: Theme = parsed.theme === "dark" ? "dark" : "light";
    const scale = (FONT_SCALES as readonly number[]).includes(parsed.scale ?? 1)
      ? ((parsed.scale ?? 1) as FontScale)
      : 1;
    return { theme, scale };
  } catch {
    return fallback;
  }
}

/** 把设置写到 <html>：主题走 data-theme（theme.css），字号用 zoom 整体缩放。 */
export function applyAppearance(theme: Theme, scale: FontScale): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.zoom = scale === 1 ? "" : String(scale);
}

interface SettingsState {
  theme: Theme;
  scale: FontScale;
  /** 后端设置（数据目录 + 项目数）；null = 还没读到 */
  appSettings: AppSettings | null;
  dataDirBusy: boolean;
  /** 本会话里最近一次迁移的结果（界面用来写清楚新旧位置） */
  lastMigration: DataDirMigration | null;
  setTheme: (theme: Theme) => void;
  setScale: (scale: FontScale) => void;
  increaseFont: () => void;
  decreaseFont: () => void;
  resetAppearance: () => void;
  /** 读后端设置（设置页挂载时调用）。 */
  loadAppSettings: () => Promise<void>;
  /** 更改数据目录：后端迁移成功后返回新的设置。 */
  changeDataDir: (path: string) => Promise<DataDirChangeResult>;
}

const initial = readPersisted();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: initial.theme,
  scale: initial.scale,
  appSettings: null,
  dataDirBusy: false,
  lastMigration: null,

  setTheme: (theme) => {
    set({ theme });
    applyAppearance(theme, get().scale);
    persist(theme, get().scale);
  },

  setScale: (scale) => {
    set({ scale });
    applyAppearance(get().theme, scale);
    persist(get().theme, scale);
  },

  increaseFont: () => {
    const index = FONT_SCALES.indexOf(get().scale);
    const next = FONT_SCALES[Math.min(FONT_SCALES.length - 1, Math.max(0, index) + 1)];
    get().setScale(next);
  },

  decreaseFont: () => {
    const index = FONT_SCALES.indexOf(get().scale);
    const next = FONT_SCALES[Math.max(0, (index < 0 ? 1 : index) - 1)];
    get().setScale(next);
  },

  resetAppearance: () => {
    get().setTheme("light");
    get().setScale(1);
  },

  loadAppSettings: async () => {
    try {
      const settings = await fetchSettings();
      set({ appSettings: settings });
    } catch {
      // 后端还没起来 / 非桌面环境：保持 null，界面显示默认目录
      set({ appSettings: null });
    }
  },

  changeDataDir: async (path) => {
    const target = path.trim();
    if (target === "") return { ok: false, message: "未选择目录" };
    set({ dataDirBusy: true });
    try {
      const response = await updateDataDir(target);
      set({
        appSettings: response.settings,
        dataDirBusy: false,
        lastMigration: response.migration,
      });
      const migration = response.migration;
      if (migration === null) {
        return { ok: true, message: `数据目录已切换：${response.settings.data_dir}` };
      }
      return {
        ok: true,
        message: `已迁移 ${migration.copied_files} 个文件到 ${migration.data_dir}${
          migration.kept_previous ? `；旧目录 ${migration.previous_dir} 保留一份` : ""
        }`,
      };
    } catch (err) {
      set({ dataDirBusy: false });
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  },
}));

function persist(theme: Theme, scale: FontScale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, scale }));
  } catch {
    // 隐私模式 / 无 localStorage：忽略，仅本次会话生效
  }
}

/** 启动时把已保存的外观应用上（App 挂载时调用一次）。 */
export function initAppearance(): void {
  const state = useSettingsStore.getState();
  applyAppearance(state.theme, state.scale);
}
