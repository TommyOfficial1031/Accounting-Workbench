import { useEffect, useMemo, useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useSaveGuard } from "../stores/useSaveGuard";
import ConfirmDialog from "../components/common/ConfirmDialog";
import SaveChangesDialog from "../components/common/SaveChangesDialog";
import NewProjectDialog from "../components/project/NewProjectDialog";
import MergeProjectsDialog from "../components/project/MergeProjectsDialog";
import type { ProjectSummary } from "../types/api";
import styles from "./ProjectsPage.module.css";

interface ProjectsPageProps {
  onOpened: () => void;
}

type Filter = "全部" | "手动创建" | "自动保存";

/** 项目页（原型 #view-projects）：管理、合并与清理本机项目。 */
function ProjectsPage({ onOpened }: ProjectsPageProps) {
  const projects = useProjectStore((state) => state.projects);
  const listProjects = useProjectStore((state) => state.listProjects);
  const openProject = useProjectStore((state) => state.openProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const { savePrompt, withSaveGuard, saveAndProceed, discardAndProceed, closeSavePrompt } =
    useSaveGuard();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("全部");
  const [showNew, setShowNew] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    void listProjects();
  }, [listProjects]);

  const rows = useMemo(() => {
    const keyword = query.trim();
    return projects.filter((project) => {
      if (keyword !== "" && !project.name.includes(keyword) && !project.creator.includes(keyword)) {
        return false;
      }
      if (filter === "全部") return true;
      const isAuto = project.name.startsWith("未命名");
      return filter === "自动保存" ? isAuto : !isAuto;
    });
  }, [projects, query, filter]);

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
          <div className={styles.title}>项目</div>
          <div className={styles.sub}>管理、合并与清理本机项目 · 按创建时间排序</div>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={projects.filter((p) => p.name.startsWith("未命名")).length === 0}
            onClick={() => {
              const targets = projects.filter((p) => p.name.startsWith("未命名"));
              targets.forEach((project) => void deleteProject(project.id));
            }}
          >
            清理未命名
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={projects.length < 2}
            onClick={() => setShowMerge(true)}
          >
            合并所选
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
            新建项目
          </button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          value={query}
          placeholder="搜索项目名 / 创建人…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="segmented">
          {(["全部", "手动创建", "自动保存"] as Filter[]).map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? "on" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <span className={styles.spacer} />
        <span className={styles.count}>{rows.length} / {projects.length} 个项目</span>
      </div>

      <div className={styles.body}>
        {rows.length === 0 ? (
          <div className={styles.empty}>暂无项目，点右上角「新建项目」创建</div>
        ) : (
          <table className={`table ${styles.table}`}>
            <thead>
              <tr>
                <th>项目名</th>
                <th>创建人</th>
                <th>创建时间</th>
                <th className={styles.num}>行 × 列</th>
                <th>结果</th>
                <th>最近打开</th>
                <th className={styles.opsHead}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((project) => (
                <tr key={project.id}>
                  <td>
                    {project.name}
                    {project.name.startsWith("未命名") && (
                      <span className={styles.tag}>自动保存</span>
                    )}
                  </td>
                  <td>{project.creator}</td>
                  <td>{project.created_at.slice(0, 10)}</td>
                  <td className={styles.num}>
                    {(project.row_count ?? 0).toLocaleString("zh-CN")} × {project.col_count ?? 0}
                  </td>
                  <td>
                    <span className={project.has_result ? styles.hasResult : styles.noResult}>
                      {project.has_result ? "有" : "—"}
                    </span>
                  </td>
                  <td className={styles.muted}>{project.last_opened_at ?? "—"}</td>
                  <td className={styles.ops}>
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => handleOpen(project.id)}
                    >
                      打开
                    </button>
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() =>
                        withSaveGuard(() => {
                          void openProject(project.id).then(() => onOpened());
                        })
                      }
                      title="打开并进入分析页"
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewProjectDialog
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            onOpened();
          }}
        />
      )}
      {showMerge && <MergeProjectsDialog onClose={() => setShowMerge(false)} />}

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
                void deleteProject(deleteTarget.id);
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

export default ProjectsPage;
