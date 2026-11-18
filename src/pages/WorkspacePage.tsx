import { useEffect, useRef, useState } from "react";
import DataGrid from "../components/table/DataGrid";
import FixedRuleMenu from "../components/analysis/FixedRuleMenu";
import { useDirtyStore } from "../stores/dirtyStore";
import { useProjectStore } from "../stores/projectStore";
import { useTableStore } from "../stores/tableStore";
import type { FixedRuleInfo } from "../types/api";
import styles from "./WorkspacePage.module.css";

interface WorkspacePageProps {
  onAnalyzeFree: () => void;
  onAnalyzeRule: (rule: FixedRuleInfo) => void;
  /** 右键「以此列分析」：把该列带进分析页。 */
  onAnalyzeColumn: (field: string) => void;
  onSave: () => void;
  /** 原型 ws-head 的「一键算」：进看板页。 */
  onOpenBoard: () => void;
}

function WorkspacePage({
  onAnalyzeFree,
  onAnalyzeRule,
  onAnalyzeColumn,
  onSave,
  onOpenBoard,
}: WorkspacePageProps) {
  const dataset = useTableStore((state) => state.dataset);
  const fixedRules = useTableStore((state) => state.fixedRules);
  const warnings = useTableStore((state) => state.warnings);
  const error = useTableStore((state) => state.error);
  const fetchPage = useTableStore((state) => state.fetchPage);
  const undo = useTableStore((state) => state.undo);
  const redo = useTableStore((state) => state.redo);
  const resetTable = useTableStore((state) => state.reset);
  const insertRows = useTableStore((state) => state.insertRows);
  const insertCols = useTableStore((state) => state.insertCols);
  const deleteRows = useTableStore((state) => state.deleteRows);
  const deleteCols = useTableStore((state) => state.deleteCols);
  const canUndo = useTableStore((state) => state.canUndo);
  const canRedo = useTableStore((state) => state.canRedo);
  const find = useTableStore((state) => state.find);
  const setFind = useTableStore((state) => state.setFind);
  const setError = useTableStore((state) => state.setError);
  const currentProject = useProjectStore((state) => state.currentProject);
  const dirty = useDirtyStore((state) => state.dirty);

  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesRef = useRef<HTMLDivElement | null>(null);
  const findRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!rulesOpen) return;

    function onPointerDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Node && rulesRef.current?.contains(target)) return;
      setRulesOpen(false);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setRulesOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [rulesOpen]);

  /* Ctrl+F 聚焦查找框（原型 Ctrl+F 查找单元格） */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.key.toLowerCase() !== "f") return;
      const target = event.target;
      if (target instanceof HTMLElement && target.tagName === "INPUT") return;
      event.preventDefault();
      findRef.current?.focus();
      findRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (dataset === null) {
    return <div className={styles.empty}>尚未导入数据</div>;
  }

  const title = currentProject?.name ?? dataset.name;
  const rulesAvailable = dataset.fixed_rules_available && fixedRules.length > 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <h1 className={styles.title} title={title}>
            {title}
          </h1>
          <p className={styles.meta}>
            {dataset.row_count.toLocaleString()} 行 × {dataset.col_count} 列
            {" · "}
            预定义字段 {dataset.predefined_hit_count} / 44
            {dataset.source_path !== "" ? ` · ${dataset.name}` : ""}
          </p>
        </div>

        <div className={styles.actions}>
          <span className={styles.saveState}>
            <span className={`${styles.dot} ${dirty ? styles.dotDirty : ""}`} />
            {dirty ? "未保存" : "已保存"}
          </span>

          {rulesAvailable && (
            <div className={styles.rulesWrap} ref={rulesRef}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRulesOpen((prev) => !prev)}
                aria-expanded={rulesOpen}
                aria-haspopup="menu"
              >
                固定规则
              </button>
              {rulesOpen && (
                <div className={styles.rulesPanel} role="menu">
                  <FixedRuleMenu
                    rules={fixedRules}
                    onAnalyze={(rule) => {
                      setRulesOpen(false);
                      onAnalyzeRule(rule);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onSave}
            disabled={currentProject === null}
            title={currentProject === null ? "请先新建或打开项目" : "保存项目（Ctrl+S）"}
          >
            保存
          </button>
          <button type="button" className="btn btn-secondary" onClick={onAnalyzeFree}>
            分析
          </button>
          <button type="button" className="btn btn-primary" onClick={onOpenBoard}>
            一键算
          </button>
        </div>
      </header>

      {/* 工具栏（原型 .toolbar）：撤销/重做 · 重置 · 增删行列 · 查找 */}
      <div className={styles.toolbar}>
        <div className={styles.toolGroup}>
          <button
            type="button"
            className={styles.toolBtn}
            title="撤销 Ctrl+Z"
            disabled={!canUndo}
            onClick={() => void undo()}
          >
            撤销
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            title="重做 Ctrl+Shift+Z"
            disabled={!canRedo}
            onClick={() => void redo()}
          >
            重做
          </button>
        </div>
        <div className={styles.toolDivider} />
        <div className={styles.toolGroup}>
          <button
            type="button"
            className={styles.toolBtn}
            title="重置到导入时状态"
            onClick={() => void resetTable()}
          >
            重置
          </button>
        </div>
        <div className={styles.toolDivider} />
        <div className={styles.toolGroup}>
          <button
            type="button"
            className={styles.toolBtn}
            title="在选中行上方插入一行"
            onClick={() => void insertRows(1)}
          >
            + 行
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            title="在选中列左侧插入一列"
            onClick={() => void insertCols(1)}
          >
            + 列
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            title="删除选中行（先点行号选中）"
            onClick={() => void deleteRows()}
          >
            − 行
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            title="删除选中列（先点列头选中）"
            onClick={() => void deleteCols()}
          >
            − 列
          </button>
        </div>
        <div className={styles.spacer} />
        <div className={styles.find}>
          <span className={styles.findIcon} aria-hidden="true">
            ⌕
          </span>
          <input
            ref={findRef}
            value={find}
            placeholder="查找单元格…"
            onChange={(event) => setFind(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setFind("");
                setError(null);
                findRef.current?.blur();
              }
            }}
          />
          {find !== "" && (
            <button
              type="button"
              className={styles.findClear}
              title="清空查找"
              onClick={() => setFind("")}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {error !== null && <p className={styles.error}>{error}</p>}

      {warnings.length > 0 && (
        <div className={styles.notice}>
          <ul className={styles.noticeList}>
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.gridArea}>
        <DataGrid dataset={dataset} fetchRows={fetchPage} onAnalyzeColumn={onAnalyzeColumn} />
      </div>
    </div>
  );
}

export default WorkspacePage;
