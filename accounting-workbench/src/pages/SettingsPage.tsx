import { useEffect, useState } from "react";

import ConfirmDialog from "../components/common/ConfirmDialog";
import { useAnalysisStore } from "../stores/analysisStore";
import {
  FONT_SCALES,
  useSettingsStore,
  type FontScale,
  type Theme,
} from "../stores/settingsStore";
import { invokeCommand, isTauri, pickDirectory } from "../utils/platform";
import styles from "./SettingsPage.module.css";

const SCALE_LABELS: Record<string, string> = {
  "0.9": "小",
  "1": "标准",
  "1.1": "大",
  "1.2": "特大",
};

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

/** 后端还没读到设置时先显示默认位置（与 storage/paths.py 的默认值一致）。 */
const DEFAULT_DATA_DIR = "~/.accounting-workbench";

/** 设置页（原型 #view-settings）：外观 / 数据 / 关于。 */
function SettingsPage() {
  const theme = useSettingsStore((state) => state.theme);
  const scale = useSettingsStore((state) => state.scale);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setScale = useSettingsStore((state) => state.setScale);
  const appSettings = useSettingsStore((state) => state.appSettings);
  const busy = useSettingsStore((state) => state.dataDirBusy);
  const lastMigration = useSettingsStore((state) => state.lastMigration);
  const loadAppSettings = useSettingsStore((state) => state.loadAppSettings);
  const changeDataDir = useSettingsStore((state) => state.changeDataDir);
  const setToast = useAnalysisStore((state) => state.setToast);

  const [pendingDir, setPendingDir] = useState<string | null>(null);

  useEffect(() => {
    void loadAppSettings();
  }, [loadAppSettings]);

  const dataDir = appSettings?.data_dir ?? DEFAULT_DATA_DIR;

  const note =
    lastMigration !== null
      ? `已迁移到 ${lastMigration.data_dir}；旧目录 ${lastMigration.previous_dir} 保留一份（不会自动删除）。`
      : appSettings === null
        ? "默认位置；更改后现有项目会复制到新目录，旧目录保留一份。"
        : appSettings.is_default
          ? `默认位置 · ${appSettings.project_count} 个项目；更改后旧目录会保留一份。`
          : `自定义位置 · ${appSettings.project_count} 个项目；默认目录是 ${appSettings.default_data_dir}。`;

  async function openDataDir(): Promise<void> {
    if (!isTauri()) {
      setToast("仅桌面版可以打开数据目录");
      return;
    }
    if (appSettings === null) {
      setToast("设置还没读到，请稍后再试");
      return;
    }
    try {
      await invokeCommand("open_folder", { path: appSettings.data_dir });
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function pickDataDir(): Promise<void> {
    if (!isTauri()) {
      setToast("仅桌面版可以更改数据目录");
      return;
    }
    const picked = await pickDirectory();
    if (picked === null) {
      setToast("未选择目录");
      return;
    }
    if (appSettings !== null && picked === appSettings.data_dir) {
      setToast("这已经是当前数据目录");
      return;
    }
    setPendingDir(picked);
  }

  async function applyDataDir(target: string): Promise<void> {
    setPendingDir(null);
    const result = await changeDataDir(target);
    setToast(result.message);
  }

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <div>
          <div className={styles.title}>设置</div>
          <div className={styles.sub}>外观、数据与关于</div>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.inner}>
          <div className={styles.group}>
            <h3>外观</h3>
            <div className={styles.row}>
              <div>
                <div className={styles.name}>主题</div>
                <div className={styles.desc}>深色主题在弱光环境下更省眼</div>
              </div>
              <div className={styles.control}>
                <div className="segmented">
                  {THEMES.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={theme === item.value ? "on" : ""}
                      onClick={() => setTheme(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.row}>
              <div>
                <div className={styles.name}>字号</div>
                <div className={styles.desc}>影响全应用的正文与表格字号</div>
              </div>
              <div className={styles.control}>
                <div className="segmented">
                  {FONT_SCALES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={scale === value ? "on" : ""}
                      onClick={() => setScale(value as FontScale)}
                    >
                      {SCALE_LABELS[String(value)] ?? String(value)}
                    </button>
                  ))}
                </div>
                <span className={styles.preview}>预览：账单时间</span>
              </div>
            </div>
          </div>

          <div className={styles.group}>
            <h3>数据</h3>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <div className={styles.name}>数据目录</div>
                <div className={styles.desc}>项目库、项目缓存与导出记录都放在这里</div>
              </div>
              <div className={styles.control}>
                <span className={styles.mono} title={dataDir}>
                  {dataDir}
                </span>
                <button type="button" className="btn btn-secondary" onClick={() => void openDataDir()}>
                  打开
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void pickDataDir()}
                >
                  {busy ? "迁移中…" : "更改目录"}
                </button>
              </div>
            </div>
            <div className={styles.note}>{note}</div>
            <div className={styles.row}>
              <div>
                <div className={styles.name}>数据不外传</div>
                <div className={styles.desc}>后端是本机 sidecar，只监听 127.0.0.1</div>
              </div>
              <div className={styles.control}>
                <span className={styles.badge}>本地</span>
              </div>
            </div>
          </div>

          <div className={styles.group}>
            <h3>关于</h3>
            <div className={styles.row}>
              <div>
                <div className={styles.name}>算账工作台 v0.1.0</div>
                <div className={styles.desc}>本地单机运行 · 数据不外传</div>
              </div>
            </div>
            <div className={styles.row}>
              <div>
                <div className={styles.name}>第三方许可</div>
                <div className={styles.desc}>AG Grid · ECharts · matplotlib · Noto Sans CJK</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {pendingDir !== null && (
        <ConfirmDialog
          title="更改数据目录"
          message={`把现有数据迁移到「${pendingDir}」？项目库、项目缓存与导出记录会复制到新目录并切换过去；原目录会保留一份，不会删除。`}
          onClose={() => setPendingDir(null)}
          actions={[
            { label: "取消", variant: "default", onClick: () => setPendingDir(null) },
            {
              label: "迁移到这里",
              variant: "primary",
              onClick: () => void applyDataDir(pendingDir),
            },
          ]}
        />
      )}
    </section>
  );
}

export default SettingsPage;
