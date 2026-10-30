import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeftIcon } from "../common/icons";
import Sidebar, { type SidebarProps } from "./Sidebar";
import TitleBar from "./TitleBar";
import styles from "./AppShell.module.css";

const STORAGE_KEY = "aw:sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export interface AppShellProps extends Omit<SidebarProps, "collapsed"> {
  children: ReactNode;
}

function AppShell({ children, ...sidebarProps }: AppShellProps) {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // 无 localStorage（隐私模式）时忽略，仅本次会话生效。
      }
      return next;
    });
  }, []);

  // 折叠热区跟着侧边栏宽度移动，用自定义属性驱动 left，保证过渡与侧边栏同步。
  const shellStyle = {
    "--shell-side-w": collapsed
      ? "var(--sidebar-width-collapsed)"
      : "var(--sidebar-width)",
  } as CSSProperties;

  return (
    <div className={styles.outer}>
      <TitleBar />
      <div className={styles.shell} style={shellStyle}>
        <Sidebar {...sidebarProps} collapsed={collapsed} />
        <div className={styles.main}>
          <div className={styles.card}>{children}</div>
        </div>
        <div className={styles.edge}>
          <button
            type="button"
            className={styles.handle}
            onClick={toggle}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-expanded={!collapsed}
          >
            <ChevronLeftIcon size={14} className={collapsed ? styles.flip : undefined} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default AppShell;
