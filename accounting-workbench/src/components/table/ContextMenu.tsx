import { useEffect } from "react";
import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
  label: string;
  /** 右侧快捷键提示，如 Ctrl+C。 */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  /** 分隔线：separator 为 true 时只画一条线。 */
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/** 原型 .ctx：右键菜单，点外部 / Esc 关闭。 */
function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Node && (target as Element).closest?.("[data-grid-ctx]")) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className={styles.menu}
      data-grid-ctx="1"
      style={{
        left: Math.min(x, Math.max(8, window.innerWidth - 240)),
        top: Math.min(y, Math.max(8, window.innerHeight - 340)),
      }}
      role="menu"
    >
      {items.map((item, index) =>
        item.separator === true ? (
          <div key={`sep-${index}`} className={styles.sep} />
        ) : (
          <button
            key={item.label}
            type="button"
            className={`${styles.item} ${item.danger === true ? styles.danger : ""}`}
            disabled={item.disabled === true}
            onClick={() => {
              onClose();
              item.onClick?.();
            }}
          >
            <span>{item.label}</span>
            {item.hint !== undefined && <kbd>{item.hint}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

export default ContextMenu;
