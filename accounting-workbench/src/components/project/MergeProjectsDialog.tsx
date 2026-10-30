import { useState } from "react";
import Modal from "../common/Modal";
import { useProjectStore } from "../../stores/projectStore";
import type { MergeResponse } from "../../types/api";
import styles from "./MergeProjectsDialog.module.css";

interface MergeProjectsDialogProps {
  onClose: () => void;
}

function MergeProjectsDialog({ onClose }: MergeProjectsDialogProps) {
  const projects = useProjectStore((state) => state.projects);
  const mergeProjects = useProjectStore((state) => state.mergeProjects);
  const [selected, setSelected] = useState<string[]>([]);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<MergeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string): void {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setPreview(null);
  }

  async function handlePreview(): Promise<void> {
    setLoading(true);
    setError(null);
    const result = await mergeProjects({
      project_ids: selected,
      base_id: baseId,
      dry_run: true,
    });
    setLoading(false);
    if (result) {
      setPreview(result);
    } else {
      setError(useProjectStore.getState().error ?? "预览失败");
    }
  }

  async function handleCommit(): Promise<void> {
    setLoading(true);
    setError(null);
    const result = await mergeProjects({
      project_ids: selected,
      base_id: baseId,
      dry_run: false,
      name: name.trim() || null,
    });
    setLoading(false);
    if (result?.project) {
      onClose();
    } else {
      setError(useProjectStore.getState().error ?? "合并失败");
    }
  }

  return (
    <Modal title="合并项目" onClose={onClose}>
      <div className={styles.body}>
        <p className={styles.hint}>选择至少两个项目进行合并：</p>
        <ul className={styles.list}>
          {projects.map((project) => (
            <li key={project.id}>
              <label className={styles.row}>
                <input
                  type="checkbox"
                  checked={selected.includes(project.id)}
                  onChange={() => toggle(project.id)}
                />
                <span>
                  {project.name}（{project.creator}）— {project.col_count ?? 0} 列 /{" "}
                  {project.row_count ?? 0} 行
                </span>
              </label>
            </li>
          ))}
        </ul>

        {selected.length >= 2 && (
          <>
            <label className={styles.field}>
              <span>基准项目（可选，默认字段最多/最早）</span>
              <select
                value={baseId ?? ""}
                onChange={(event) => {
                  setBaseId(event.target.value || null);
                  setPreview(null);
                }}
              >
                <option value="">自动</option>
                {selected.map((id) => {
                  const project = projects.find((x) => x.id === id);
                  return (
                    <option key={id} value={id}>
                      {project?.name}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className={styles.field}>
              <span>合并后项目名（可选）</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="默认「合并项目」"
              />
            </label>
            <button
              type="button"
              className={styles.previewButton}
              disabled={loading}
              onClick={() => void handlePreview()}
            >
              {loading ? "预览中…" : "预览合并"}
            </button>
          </>
        )}

        {preview !== null && (
          <div className={styles.preview}>
            <p className={styles.summary}>
              共 {preview.preview.total_rows} 行、{preview.preview.columns.length} 列；来源分布：{" "}
              {Object.entries(preview.sources_distribution)
                .map(([key, count]) => `${key}: ${count} 行`)
                .join("、")}
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {preview.preview.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell === null ? "" : String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className={styles.commitButton}
              disabled={loading}
              onClick={() => void handleCommit()}
            >
              {loading ? "合并中…" : "确认合并"}
            </button>
          </div>
        )}

        {error !== null && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  );
}

export default MergeProjectsDialog;
