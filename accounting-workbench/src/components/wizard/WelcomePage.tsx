import { useState } from "react";
import { isMac } from "../../utils/platform";
import styles from "./WelcomePage.module.css";

interface WelcomePageProps {
  hasProject: boolean;
  busy: boolean;
  showPathInput: boolean;
  onResume: () => void;
  onCreateProject: () => void;
  onImportPath: (path: string) => void;
}

function Key({ children }: { children: string }) {
  return <kbd>{children}</kbd>;
}

function WelcomePage({
  hasProject,
  busy,
  showPathInput,
  onResume,
  onCreateProject,
  onImportPath,
}: WelcomePageProps) {
  const mod = isMac() ? "⌘" : "Ctrl";
  const [path, setPath] = useState("");

  return (
    <div className={styles.welcome}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>算账工作台</h1>
          <p className={styles.tagline}>本地单机运行 · 账单数据不离开这台电脑</p>
        </header>

        <div className={styles.actions}>
          {hasProject && (
            <button type="button" className={styles.primary} onClick={onResume}>
              继续当前项目
            </button>
          )}
          <button
            type="button"
            className={hasProject ? styles.secondary : styles.primary}
            onClick={onCreateProject}
            disabled={busy}
          >
            {busy ? "处理中…" : "新建项目"}
          </button>
        </div>

        {showPathInput && (
          <div className={styles.devImport}>
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="开发模式：粘贴本地文件路径（xlsx / xls / csv）"
              spellCheck={false}
            />
            <button
              type="button"
              className={styles.secondary}
              onClick={() => onImportPath(path.trim())}
              disabled={path.trim() === ""}
            >
              导入
            </button>
          </div>
        )}

        <ul className={styles.hints}>
          <li className={styles.hint}>
            <span className={styles.keys}>
              <Key>{mod}</Key>
              <Key>Shift</Key>
              <Key>N</Key>
            </span>
            点击「新建项目」创建新项目
          </li>
          <li className={styles.hint}>将文件拖到此处创建新项目</li>
          <li className={styles.hint}>
            <span className={styles.keys}>
              <Key>{mod}</Key>
              <Key>Shift</Key>
              <Key>K</Key>
            </span>
            分析数据
          </li>
          <li className={styles.hint}>
            <span className={styles.keys}>
              <Key>{mod}</Key>
              <Key>S</Key>
            </span>
            保存项目
          </li>
        </ul>

        <ul className={styles.notes}>
          <li className={styles.note}>请将数据格式（公式、条件格式、颜色填充等）清洗后导入</li>
          <li className={styles.note}>支持 xlsx、xls、csv 文件</li>
        </ul>
      </div>
    </div>
  );
}

export default WelcomePage;
