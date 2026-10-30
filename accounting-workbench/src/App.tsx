import { useCallback, useEffect, useState } from "react";
import AppShell from "./components/layout/AppShell";
import AnalysisWindow from "./components/analysis/AnalysisWindow";
import RegressionWindow from "./components/regression/RegressionWindow";
import BoardWindow from "./components/board/BoardWindow";
import NewProjectDialog from "./components/project/NewProjectDialog";
import WelcomePage from "./components/wizard/WelcomePage";
import WorkspacePage from "./pages/WorkspacePage";
import RegressionPage from "./pages/RegressionPage";
import BoardPage from "./pages/BoardPage";
import SettingsPage from "./pages/SettingsPage";
import HelpPage from "./pages/HelpPage";
import ExportManagerPage from "./pages/ExportManagerPage";
import ProjectsPage from "./pages/ProjectsPage";
import HistoryPage from "./pages/HistoryPage";
import Toast from "./components/common/Toast";
import SaveChangesDialog from "./components/common/SaveChangesDialog";
import { probeBackend } from "./api/client";
import { useAnalysisStore } from "./stores/analysisStore";
import { useEconStore } from "./stores/econStore";
import { useChartStore } from "./stores/chartStore";
import { initAppearance } from "./stores/settingsStore";
import { useProjectStore } from "./stores/projectStore";
import { useTableStore } from "./stores/tableStore";
import { useSaveGuard } from "./stores/useSaveGuard";
import { useGlobalShortcuts } from "./utils/shortcuts";
import { isTauri, pickOpenPath } from "./utils/platform";
import { createDropDedupe, fileNameOf, firstTableFile } from "./utils/droppedFile";
import { selectedColumnIndices } from "./utils/gridSelection";
import type { FixedRuleInfo } from "./types/api";
import styles from "./App.module.css";

type Boot = "booting" | "ready" | "offline";
type View =
  | "home"
  | "workspace"
  | "regression"
  | "board"
  | "analysis"
  | "settings"
  | "help"
  | "exports"
  | "projects"
  | "history";

function App() {
  const [boot, setBoot] = useState<Boot>("booting");
  const [bootError, setBootError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>("home");
  const [showNewProject, setShowNewProject] = useState(false);
  /** 拖文件进窗口时带进来的路径：NewProjectDialog 会预填它。 */
  const [dropPath, setDropPath] = useState<string | null>(null);
  const [isRegressionOpen, setIsRegressionOpen] = useState(false);
  const [isBoardOpen, setIsBoardOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const dataset = useTableStore((state) => state.dataset);
  const recentProjects = useProjectStore((state) => state.recentProjects);
  const currentProject = useProjectStore((state) => state.currentProject);
  const openProject = useProjectStore((state) => state.openProject);
  const fetchRecent = useProjectStore((state) => state.fetchRecent);
  const saveCurrent = useProjectStore((state) => state.saveCurrent);
  const toast = useAnalysisStore((state) => state.toast);
  const setToast = useAnalysisStore((state) => state.setToast);
  const clearToast = useAnalysisStore((state) => state.clearToast);
  const openForRule = useAnalysisStore((state) => state.openForRule);
  const openFree = useAnalysisStore((state) => state.openFree);
  const analysisTimeRange = useAnalysisStore((state) => state.timeRange);
  const resetChartConfig = useChartStore((state) => state.resetConfig);
  const { savePrompt, withSaveGuard, saveAndProceed, discardAndProceed, closeSavePrompt } =
    useSaveGuard();

  /* 启动时应用已保存的外观设置（主题 / 字号） */
  useEffect(() => {
    initAppearance();
  }, []);

  /* 把文件拖进窗口 = 新建项目（用户反馈 2026-10-28：首页「将文件拖到此处创建新项目」没反应）。
   * WebView2 里 HTML5 drop 事件拿不到完整路径，只能走 Tauri 的拖放事件；这里同时挂两条通道：
   *   ① webview 的 `tauri://drag-drop`（官方 API）；
   *   ② Rust 侧 `.on_window_event` 里补发的 `aw://file-dropped`（兜底，见 src-tauri/src/main.rs）。
   * 两条会各来一次，用 createDropDedupe 去重；真失败了要能在界面上看见原因，不再静默。 */
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    const disposes: Array<() => void> = [];
    const dedupe = createDropDedupe();

    function accept(paths: readonly string[]): void {
      const file = firstTableFile(paths);
      if (file === null) {
        setToast(
          paths.length > 0
            ? `只支持 xlsx / xls / csv 文件（拖入的是 ${fileNameOf(paths[0] ?? "")}）`
            : "没有读到拖入文件的路径，请用「新建项目 → 浏览」选择文件",
        );
        return;
      }
      if (!dedupe(file)) return;
      setDropPath(file);
      setShowNewProject(true);
    }

    void (async () => {
      try {
        const [webviewApi, eventApi] = await Promise.all([
          import("@tauri-apps/api/webview"),
          import("@tauri-apps/api/event"),
        ]);
        if (!alive) return;
        const offWebview = await webviewApi.getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type !== "drop") return;
          accept(event.payload.paths);
        });
        const offRust = await eventApi.listen<string[]>("aw://file-dropped", (event) => {
          accept(event.payload);
        });
        if (!alive) {
          offWebview();
          offRust();
          return;
        }
        disposes.push(offWebview, offRust);
      } catch (err) {
        console.warn("[drag-drop] 监听失败", err);
        if (alive) setToast("拖入文件功能初始化失败：请用「新建项目 → 浏览」选择文件");
      }
    })();

    /* ③ 兜底：main.tsx 里的 HTML5 drop 转发（只有 Tauri 拖放处理没生效时才会来） */
    function onHtml5Drop(event: Event): void {
      const detail = (event as CustomEvent<{ paths?: string[] }>).detail;
      accept(detail?.paths ?? []);
    }
    window.addEventListener("aw:html5-drop", onHtml5Drop);

    return () => {
      alive = false;
      window.removeEventListener("aw:html5-drop", onHtml5Drop);
      for (const dispose of disposes) dispose();
    };
  }, [setToast]);

  const handleSave = useCallback(async () => {
    const message = await saveCurrent();
    setToast(message);
  }, [saveCurrent, setToast]);

  /* 把一组列带进分析页：文本列 → 筛选条件（等于/全部），数值列 → 指标（求和）。 */
  const openAnalysisForColumns = useCallback(
    (fields: string[]) => {
      const current = useTableStore.getState().dataset;
      if (current === null) {
        setToast("请先导入表格或打开项目");
        return;
      }
      resetChartConfig();
      openFree(current);
      const analysis = useAnalysisStore.getState();
      const textFields = fields.filter(
        (field) => current.columns.find((item) => item.name === field)?.dtype !== "number",
      );
      const numberFields = fields.filter(
        (field) => current.columns.find((item) => item.name === field)?.dtype === "number",
      );
      if (textFields.length > 0) analysis.addFilterRows(textFields);
      if (numberFields.length > 0) analysis.addMetricBoxes(numberFields);
      setView("analysis");
    },
    [openFree, resetChartConfig, setToast],
  );

  /* 右上「分析」：有选中列就按原型带进去，没选就走自由分析。 */
  const handleAnalyzeFree = useCallback(() => {
    const current = useTableStore.getState().dataset;
    if (current === null) {
      setToast("请先导入表格或打开项目");
      return;
    }
    const selection = useTableStore.getState().selection;
    const indices = selectedColumnIndices(selection);
    const fields = indices
      .map((index) => current.columns[index]?.name)
      .filter((name): name is string => name !== undefined);
    if (fields.length === 0) {
      resetChartConfig();
      openFree(current);
      setView("analysis");
      return;
    }
    openAnalysisForColumns(fields);
    if (fields.length > 0) {
      setToast(`已带入 ${fields.length} 个字段（文本 → 筛选条件，数值 → 指标）`);
    }
  }, [openAnalysisForColumns, openFree, resetChartConfig, setToast]);

  /* 右键「以此列分析」：数值列直接作为指标，文本列作为分组维度。 */
  const handleAnalyzeColumn = useCallback(
    (field: string) => {
      if (field === "") {
        setToast("先选中一列再分析");
        return;
      }
      openAnalysisForColumns([field]);
    },
    [openAnalysisForColumns, setToast],
  );

  /* 表格页右上角「一键算」与看板页共用同一个入口（原型 ws-head）。 */
  const openBoard = useCallback(() => {
    if (useTableStore.getState().dataset === null) {
      setToast("请先导入表格或打开项目");
      return;
    }
    useEconStore.getState().reset();
    setView("board");
  }, [setToast]);

  // 启动：先确认后端可用，再尝试自动打开上次的项目（有历史则直接进表格界面）。
  useEffect(() => {
    let cancelled = false;

    async function start(): Promise<void> {
      setBoot("booting");
      setBootError("");
      try {
        await probeBackend();
      } catch (err) {
        if (cancelled) return;
        setBootError(err instanceof Error ? err.message : String(err));
        setBoot("offline");
        return;
      }
      if (cancelled) return;

      const projectStore = useProjectStore.getState();
      const opened = await projectStore.openLastProject();
      if (cancelled) return;

      void projectStore.fetchRecent();

      if (opened) {
        setView("workspace");
      } else {
        const message = useProjectStore.getState().error;
        if (message !== null) setToast(`上次的项目未能打开：${message}`);
      }
      setBoot("ready");
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, [attempt, setToast]);

  // 数据一旦载入（新建 / 打开 / 快速导入）就进入工作区。
  useEffect(() => {
    if (dataset !== null) setView("workspace");
  }, [dataset]);

  function handleAnalyzeRule(rule: FixedRuleInfo): void {
    const current = useTableStore.getState().dataset;
    if (current === null) return;
    resetChartConfig();
    openForRule(rule, current);
    setView("analysis");
  }

  async function runImport(path: string): Promise<void> {
    const trimmed = path.trim();
    if (trimmed === "") return;
    setImporting(true);
    try {
      await useTableStore.getState().importFile(trimmed);
      const message = useTableStore.getState().error;
      if (message !== null) setToast(message);
    } finally {
      setImporting(false);
    }
  }

  async function handleQuickImport(): Promise<void> {
    const path = await pickOpenPath();
    if (path === null) {
      if (isTauri()) {
        setToast("未选择文件");
      } else {
        setView("home");
        setToast("浏览器环境请在首页输入文件路径");
      }
      return;
    }
    await runImport(path);
  }

  function handleOpenRecent(id: string): void {
    withSaveGuard(() => {
      void openProject(id).then(() => {
        void fetchRecent();
      });
    });
  }

  useGlobalShortcuts({
    onSave: handleSave,
    onAnalyze: handleAnalyzeFree,
    onNewProject: () => setShowNewProject(true),
  });

  if (boot === "booting") {
    return (
      <div className={styles.boot}>
        <div className={styles.bootInner}>
          <span className={styles.spinner} aria-hidden="true" />
          <p className={styles.bootText}>正在启动算账工作台…</p>
        </div>
      </div>
    );
  }

  if (boot === "offline") {
    return (
      <div className={styles.boot}>
        <div className={styles.bootInner}>
          <p className={styles.offlineTitle}>后端服务未就绪</p>
          <p className={styles.offlineText}>
            {bootError === "" ? "无法连接本地计算服务，请重启应用。" : bootError}
          </p>
          <button type="button" className={styles.retry} onClick={() => setAttempt((n) => n + 1)}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppShell
        view={view}
        recentProjects={recentProjects}
        hasDataset={dataset !== null}
        hasProject={currentProject !== null}
        onGoHome={() => setView("home")}
        onNewProject={() => setShowNewProject(true)}
        onQuickImport={() => void handleQuickImport()}
        onSave={() => void handleSave()}
        onOpenProjects={() => setView("projects")}
        onOpenHistory={() => setView("history")}
        onOpenRecent={handleOpenRecent}
        onOpenHelp={() => setView("help")}
        onOpenSettings={() => setView("settings")}
        onOpenExports={() => setView("exports")}
      >
        {view === "analysis" ? (
          <AnalysisWindow
            onClose={() => setView("workspace")}
            onOpenRegression={() => {
              useEconStore.getState().reset();
              setView("regression");
            }}
          />
        ) : view === "board" ? (
          <BoardPage datasetId={dataset === null ? null : dataset.id} onBack={() => setView("workspace")} />
        ) : view === "regression" ? (
          <RegressionPage
            datasetId={dataset === null ? null : dataset.id}
            onBack={() => setView("workspace")}
          />
        ) : view === "settings" ? (
          <SettingsPage />
        ) : view === "help" ? (
          <HelpPage />
        ) : view === "exports" ? (
          <ExportManagerPage />
        ) : view === "projects" ? (
          <ProjectsPage onOpened={() => setView("workspace")} />
        ) : view === "history" ? (
          <HistoryPage
            onOpened={() => setView("workspace")}
            onOpenProjects={() => setView("projects")}
          />
        ) : view === "home" ? (
          <WelcomePage
            hasProject={dataset !== null}
            busy={importing}
            showPathInput={!isTauri()}
            onResume={() => setView("workspace")}
            onCreateProject={() => setShowNewProject(true)}
            onImportPath={(path) => void runImport(path)}
          />
        ) : (
          <WorkspacePage
            onAnalyzeFree={handleAnalyzeFree}
            onAnalyzeRule={handleAnalyzeRule}
            onAnalyzeColumn={handleAnalyzeColumn}
            onSave={() => void handleSave()}
            onOpenBoard={openBoard}
          />
        )}
      </AppShell>

      {showNewProject && (
        <NewProjectDialog
          initialPath={dropPath ?? undefined}
          onClose={() => {
            setShowNewProject(false);
            setDropPath(null);
          }}
        />
      )}
      {isBoardOpen && (
        <BoardWindow
          onClose={() => setIsBoardOpen(false)}
          datasetId={dataset === null ? null : dataset.id}
          timeRange={
            analysisTimeRange ?? { start: "1970-01-01", end: "2999-12-31", field: "账单时间" }
          }
        />
      )}
      {isRegressionOpen && (
        <RegressionWindow
          onClose={() => setIsRegressionOpen(false)}
          datasetId={dataset === null ? null : dataset.id}
          timeRange={
            analysisTimeRange ?? { start: "1970-01-01", end: "2999-12-31", field: "账单时间" }
          }
        />
      )}

      <SaveChangesDialog
        prompt={savePrompt}
        onSave={(onProceed) => void saveAndProceed(onProceed)}
        onDiscard={discardAndProceed}
        onClose={closeSavePrompt}
      />

      {toast !== null && <Toast message={toast} onClose={clearToast} />}
    </>
  );
}

export default App;
