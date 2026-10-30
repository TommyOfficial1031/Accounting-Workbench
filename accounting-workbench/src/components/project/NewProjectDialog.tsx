import { useState } from "react";
import Modal from "../common/Modal";
import { useProjectStore } from "../../stores/projectStore";
import { pickOpenPath } from "../../utils/platform";
import styles from "./NewProjectDialog.module.css";

/** 拖进来的文件：默认项目名 = 文件名（去掉扩展名）。 */
function defaultNameOf(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? "";
  return file.replace(/\.(xlsx|xls|csv)$/i, "");
}

interface NewProjectDialogProps {
  onClose: () => void;
  /** 建好项目后回调（外层用它把自己的窗口一起关掉）。 */
  onCreated?: () => void;
  /** 拖文件进窗口带进来的路径（预填导入路径与项目名）。 */
  initialPath?: string;
}

function NewProjectDialog({ onClose, onCreated, initialPath }: NewProjectDialogProps) {
  const createProject = useProjectStore((state) => state.createProject);
  const loading = useProjectStore((state) => state.loading);
  const error = useProjectStore((state) => state.error);
  const [name, setName] = useState(() => defaultNameOf(initialPath ?? ""));
  const [creator, setCreator] = useState("");
  const [sourcePath, setSourcePath] = useState(initialPath ?? "");

  async function handleBrowse(): Promise<void> {
    const path = await pickOpenPath();
    if (path) setSourcePath(path);
  }

  async function handleSubmit(): Promise<void> {
    await createProject(name.trim(), creator.trim(), sourcePath.trim());
    if (useProjectStore.getState().error === null) {
      onClose();
      onCreated?.();
    }
  }

  const canSubmit =
    name.trim() !== "" && creator.trim() !== "" && sourcePath.trim() !== "" && !loading;

  return (
    <Modal title="新建项目" onClose={onClose}>
      <div className={styles.form}>
        <label className={styles.field}>
          <span>项目名</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="必填" />
        </label>
        <label className={styles.field}>
          <span>创建人</span>
          <input value={creator} onChange={(event) => setCreator(event.target.value)} placeholder="必填" />
        </label>
        <label className={styles.field}>
          <span>文件导入路径</span>
          <div className={styles.pathRow}>
            <input
              value={sourcePath}
              onChange={(event) => setSourcePath(event.target.value)}
              placeholder="粘贴路径或浏览"
            />
            <button type="button" onClick={() => void handleBrowse()}>
              浏览
            </button>
          </div>
        </label>
        {error !== null && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={styles.submit}
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {loading ? "创建中…" : "确定"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default NewProjectDialog;
