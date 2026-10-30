import { useEffect, useState } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { useSaveGuard } from "../../stores/useSaveGuard";
import Modal from "../common/Modal";
import ConfirmDialog from "../common/ConfirmDialog";
import SaveChangesDialog from "../common/SaveChangesDialog";
import NewProjectDialog from "./NewProjectDialog";
import MergeProjectsDialog from "./MergeProjectsDialog";
import type { ProjectSummary } from "../../types/api";
import styles from "./ProjectManager.module.css";

interface ProjectManagerProps {
  onClose: () => void;
}

function ProjectManager({ onClose }: ProjectManagerProps) {
  const projects = useProjectStore((state) => state.projects);
  const listProjects = useProjectStore((state) => state.listProjects);
  const openProject = useProjectStore((state) => state.openProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const { savePrompt, withSaveGuard, saveAndProceed, discardAndProceed, closeSavePrompt } =
    useSaveGuard();

  const [showNew, setShowNew] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    void listProjects();
  }, [listProjects]);

  return (
    <Modal title="项目管理" onClose={onClose}>
      <div className={styles.body}>
        <div className={styles.toolbar}>
          <button type="button" className={styles.button} onClick={() => setShowNew(true)}>
            新建项目
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={projects.length < 2}
            onClick={() => setShowMerge(true)}
          >
            合并项目
          </button>
        </div>

        {projects.length === 0 ? (
          <p className={styles.empty}>暂无项目，点击「新建项目」创建</p>
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
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>{project.name}</td>
                  <td>{project.creator}</td>
                  <td>{project.created_at}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() =>
                        withSaveGuard(() => {
                          void openProject(project.id);
                          onClose();
                        })
                      }
                    >
                      打开
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
            // 建好项目直接进表格页，项目管理窗口一起关掉
            setShowNew(false);
            onClose();
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
    </Modal>
  );
}

export default ProjectManager;
