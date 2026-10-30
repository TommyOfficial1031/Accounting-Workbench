import { useEffect, useState } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { useSaveGuard } from "../../stores/useSaveGuard";
import Modal from "../common/Modal";
import ConfirmDialog from "../common/ConfirmDialog";
import SaveChangesDialog from "../common/SaveChangesDialog";
import type { ProjectSummary } from "../../types/api";
import styles from "./HistoryWindow.module.css";

const PAGE_SIZE = 8;

interface HistoryWindowProps {
  onClose: () => void;
}

function HistoryWindow({ onClose }: HistoryWindowProps) {
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

  function goPage(next: number): void {
    const clamped = Math.max(0, Math.min(next, totalPages - 1));
    setPage(clamped);
    void load(clamped);
  }

  function handleOpen(id: string): void {
    withSaveGuard(() => {
      void openProject(id);
      onClose();
    });
  }

  function handleDelete(project: ProjectSummary): void {
    withSaveGuard(() => setDeleteTarget(project));
  }

  return (
    <Modal title="历史记录" onClose={onClose}>
      <div className={styles.body}>
        <div className={styles.filters}>
          <label className={styles.filterField}>
            <span>项目名</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="模糊匹配" />
          </label>
          <label className={styles.filterField}>
            <span>创建人</span>
            <input value={creator} onChange={(event) => setCreator(event.target.value)} placeholder="模糊匹配" />
          </label>
          <label className={styles.filterField}>
            <span>创建开始</span>
            <input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>创建结束</span>
            <input type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} />
          </label>
          <button type="button" className={styles.queryButton} onClick={applyFilters}>
            查询
          </button>
        </div>

        {error !== null && <p className={styles.error}>{error}</p>}

        {loading ? (
          <p className={styles.empty}>加载中…</p>
        ) : items.length === 0 ? (
          <p className={styles.empty}>暂无匹配的项目</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>项目名</th>
                <th>创建人</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((project) => (
                <tr key={project.id}>
                  <td>{project.name}</td>
                  <td>{project.creator}</td>
                  <td>{project.created_at}</td>
                  <td>
                    <button type="button" className={styles.link} onClick={() => handleOpen(project.id)}>
                      打开
                    </button>
                    <button type="button" className={styles.linkDanger} onClick={() => handleDelete(project)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className={styles.footer}>
          <div className={styles.pagination}>
            <button type="button" disabled={page === 0} onClick={() => goPage(page - 1)}>
              上一页
            </button>
            <span>
              第 {page + 1} / {totalPages} 页（共 {total} 条）
            </span>
            <button type="button" disabled={page >= totalPages - 1} onClick={() => goPage(page + 1)}>
              下一页
            </button>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            关闭
          </button>
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
    </Modal>
  );
}

export default HistoryWindow;
