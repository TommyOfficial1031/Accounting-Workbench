import { useEffect, useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useSaveGuard } from "../stores/useSaveGuard";
import ConfirmDialog from "../components/common/ConfirmDialog";
import SaveChangesDialog from "../components/common/SaveChangesDialog";
import type { ProjectSummary } from "../types/api";
import styles from "./HistoryPage.module.css";

const PAGE_SIZE = 8;

interface HistoryPageProps {
  onOpened: () => void;
  onOpenProjects: () => void;
}

/** 历史记录页（原型 #view-history）：按最后保存时间排序，找回最近分析过的项目。 */
function HistoryPage({ onOpened, onOpenProjects }: HistoryPageProps) {
  const queryHistory = useProjectStore((state) => state.queryHistory);
  const openProject = useProjectStore((state) => state.openProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);

  const { savePrompt, withSaveGuard, saveAndProceed, discardAndProceed, closeSavePrompt } =
    useSaveGuard();

  const [name, setName] = useState("");
  const [creator, setCreator] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<ProjectSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function load(targetPage: number): Promise<void> {
    setLoading(true);
    setError(null);
    const result = await queryHistory({
      name: name || undefined,
      creator: creator || undefined,
      created_from: createdFrom || undefined,
      created_to: createdTo || undefined,
      order_by: "updated_at",
      offset: targetPage * PAGE_SIZE,
      limit: PAGE_SIZE,
    });
    setLoading(false);
    if (result) {
      setItems(result.items);
      setTotal(result.total);
    } else {
      setError(useProjectStore.getState().error ?? "查询失败");
    }
  }

  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(): void {
    setPage(0);
    void load(0);
  }

  function resetFilters(): void {
    setName("");
    setCreator("");
    setCreatedFrom("");
    setCreatedTo("");
    setPage(0);
    void load(0);
  }

  function goPage(next: number): void {
    const clamped = Math.max(0, Math.min(next, totalPages - 1));
    setPage(clamped);
    void load(clamped);
  }

  function handleOpen(id: string): void {
    withSaveGuard(() => {
      void openProject(id);
      onOpened();
    });
  }

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <div>
          <div className={styles.title}>历史记录</div>
          <div className={styles.sub}>按最后保存时间排序，找回最近分析过的项目</div>
        </div>
        <div className={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={onOpenProjects}>
            到项目管理
          </button>
        </div>
      </header>

      <div className={styles.wrap}>
        <aside className={styles.filters}>
          <label className={styles.field}>
            <span>项目名</span>
            <input
              value={name}
              placeholder="模糊匹配"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
            />
          </label>
          <label className={styles.field}>
            <span>创建人</span>
            <input
              value={creator}
              placeholder="模糊匹配"
              onChange={(event) => setCreator(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
            />
          </label>
          <label className={styles.field}>
            <span>创建时间</span>
            <input
              type="date"
              value={createdFrom}
              onChange={(event) => setCreatedFrom(event.target.value)}
            />
            <input
              type="date"
              value={createdTo}
              onChange={(event) => setCreatedTo(event.target.value)}
            />
          </label>
          <button type="button" className="btn btn-secondary" onClick={resetFilters}>
            重置筛选
          </button>
          <button type="button" className="btn btn-primary" onClick={applyFilters}>
            查询
          </button>
        </aside>

        <div className={styles.list}>
          {error !== null && <div className={styles.error}>{error}</div>}
          {loading ? (
            <div className={styles.empty}>加载中…</div>
          ) : items.length === 0 ? (
            <div className={styles.empty}>暂无匹配的项目</div>
          ) : (
            <ul className={styles.rows}>
              {items.map((project) => (
                <li key={project.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowName}>
                      {project.name}
                      {project.has_result && <span className={styles.badge}>有结果</span>}
                    </div>
                    <div className={styles.rowMeta}>
                      {(project.row_count ?? 0).toLocaleString("zh-CN")} 行 ×{" "}
                      {project.col_count ?? 0} 列 · {project.creator} · 最后保存{" "}
                      {project.last_opened_at ?? project.updated_at}
                    </div>
                  </div>
                  <div className={styles.rowOps}>
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => handleOpen(project.id)}
                    >
                      分析
                    </button>
                    <button
                      type="button"
                      className={styles.linkDanger}
                      onClick={() => withSaveGuard(() => setDeleteTarget(project))}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.footer}>
            <button type="button" disabled={page === 0} onClick={() => goPage(page - 1)}>
              上一页
            </button>
            <span>
              第 {page + 1} / {totalPages} 页（共 {total} 条）
            </span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => goPage(page + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {deleteTarget !== null && (
        <ConfirmDialog
          title="删除项目"
          message={`确定删除项目「${deleteTarget.name}」？删除后其缓存目录将被清理，且不可恢复。`}
          onClose={() => setDeleteTarget(null)}
          actions={[
            { label: "取消", variant: "default", onClick: () => setDeleteTarget(null) },
            {
              label: "删除",
              variant: "danger",
              onClick: () => {
                void deleteProject(deleteTarget.id).then(() => void load(page));
                setDeleteTarget(null);
              },
            },
          ]}
        />
      )}

      <SaveChangesDialog
        prompt={savePrompt}
        onSave={(onProceed) => void saveAndProceed(onProceed)}
        onDiscard={discardAndProceed}
        onClose={closeSavePrompt}
      />
    </section>
  );
}

export default HistoryPage;
