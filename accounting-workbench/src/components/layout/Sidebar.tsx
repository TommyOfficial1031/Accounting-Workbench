import { useEffect, useState, type ReactNode } from "react";
import type { ProjectSummary } from "../../types/api";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  ExportIcon,
  FileIcon,
  FolderIcon,
  HelpIcon,
  HistoryIcon,
  HomeIcon,
  SettingsIcon,
} from "../common/icons";
import styles from "./Sidebar.module.css";
import appIcon from "../../assets/app-icon.png";

type MenuId = "file" | "history" | "settings";

export interface SidebarProps {
  view: "home" | "workspace" | "regression" | "board" | "analysis" | "settings" | "help" | "exports" | "projects" | "history";
  collapsed: boolean;
  recentProjects: ProjectSummary[];
  hasDataset: boolean;
  hasProject: boolean;
  onGoHome: () => void;
  onNewProject: () => void;
  onQuickImport: () => void;
  onSave: () => void;
  onOpenProjects: () => void;
  onOpenHistory: () => void;
  onOpenRecent: (id: string) => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenExports: () => void;
}

interface ItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  open?: boolean;
  onClick: () => void;
  menu?: ReactNode;
  menuUp?: boolean;
}

function Item({ icon, label, active = false, open = false, onClick, menu, menuUp = false }: ItemProps) {
  return (
    <div className={styles.itemWrap} data-tip={label}>
      <button
        type="button"
        className={`${styles.item} ${active ? styles.itemActive : ""}`}
        onClick={onClick}
        aria-haspopup={menu !== undefined ? "menu" : undefined}
        aria-expanded={menu !== undefined ? open : undefined}
        title={label}
      >
        <span className={styles.itemIcon}>{icon}</span>
        <span className={styles.label}>{label}</span>
      </button>
      {open && menu !== undefined ? (
        <div className={`${styles.menu} ${menuUp ? styles.menuUp : ""}`} data-sidebar-menu="true">
          {menu}
        </div>
      ) : null}
    </div>
  );
}

interface MenuItemProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function MenuItem({ label, onClick, disabled = false }: MenuItemProps) {
  return (
    <button type="button" className={styles.menuItem} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

function Sidebar({
  view,
  collapsed,
  recentProjects,
  hasProject,
  onGoHome,
  onNewProject,
  onQuickImport,
  onSave,
  onOpenProjects,
  onOpenHistory,
  onOpenRecent,
  onOpenHelp,
  onOpenSettings,
  onOpenExports,
}: SidebarProps) {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const increaseFont = useSettingsStore((state) => state.increaseFont);
  const decreaseFont = useSettingsStore((state) => state.decreaseFont);

  useEffect(() => {
    if (openMenu === null) return;

    function onPointerDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-sidebar-menu]") !== null) return;
      setOpenMenu(null);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpenMenu(null);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  function close(): void {
    setOpenMenu(null);
  }

  function toggle(id: MenuId): void {
    setOpenMenu((prev) => (prev === id ? null : id));
  }

  function run(action: () => void): void {
    close();
    action();
  }

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      <div className={styles.brand}>
        {/* 侧边栏 logo = 应用图标（assets/icon 里挑定的计算器线稿，构建时由 Vite 打包成 hash 资源） */}
        <img className={styles.brandMark} src={appIcon} alt="" aria-hidden="true" />
        <span className={styles.brandText}>
          <span className={styles.brandTitle}>算账工作台</span>
          <span className={styles.brandSub}>Accounting Workbench</span>
        </span>
      </div>

      <nav className={styles.nav} aria-label="主菜单">
        <Item
          icon={<HomeIcon />}
          label="首页"
          active={view === "home"}
          onClick={() => run(onGoHome)}
        />

        <Item
          icon={<FileIcon />}
          label="文件"
          open={openMenu === "file"}
          onClick={() => toggle("file")}
          menu={
            <>
              <MenuItem label="新建项目…" onClick={() => run(onNewProject)} />
              <MenuItem label="导入表格…" onClick={() => run(onQuickImport)} />
              <div className={styles.menuDivider} />
              <MenuItem label="保存" onClick={() => run(onSave)} disabled={!hasProject} />
            </>
          }
        />

        <Item icon={<FolderIcon />} label="项目" onClick={() => run(onOpenProjects)} />

        <Item
          icon={<HistoryIcon />}
          label="历史记录"
          open={openMenu === "history"}
          onClick={() => toggle("history")}
          menu={
            <>
              {recentProjects.length === 0 ? (
                <p className={styles.menuEmpty}>暂无历史记录</p>
              ) : (
                recentProjects.map((project) => (
                  <MenuItem
                    key={project.id}
                    label={project.name}
                    onClick={() => run(() => onOpenRecent(project.id))}
                  />
                ))
              )}
              <div className={styles.menuDivider} />
              <MenuItem label="更多历史记录" onClick={() => run(onOpenHistory)} />
            </>
          }
        />

        <Item
          icon={<ExportIcon />}
          label="导出文件"
          active={view === "exports"}
          onClick={() => run(onOpenExports)}
        />

        <Item icon={<HelpIcon />} label="帮助" active={view === "help"} onClick={() => run(onOpenHelp)} />
      </nav>

      <div className={styles.footer}>
        <Item
          icon={<SettingsIcon />}
          label="设置"
          active={view === "settings"}
          open={openMenu === "settings"}
          onClick={() => toggle("settings")}
          menuUp
          menu={
            <>
              <p className={styles.menuHint}>显示</p>
              <MenuItem label="字体增大" onClick={() => run(increaseFont)} />
              <MenuItem label="字体缩小" onClick={() => run(decreaseFont)} />
              <div className={styles.menuDivider} />
              <MenuItem label="深色主题" onClick={() => run(() => setTheme("dark"))} />
              <MenuItem label="浅色主题" onClick={() => run(() => setTheme("light"))} />
              <div className={styles.menuDivider} />
              <MenuItem label="打开设置页…" onClick={() => run(onOpenSettings)} />
            </>
          }
        />
      </div>
    </aside>
  );
}

export default Sidebar;
