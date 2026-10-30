import { useEffect } from "react";
import { isMac } from "./platform";

// macOS 用 Cmd，Windows/Linux 用 Ctrl。
export function isModPressed(event: KeyboardEvent): boolean {
  return isMac() ? event.metaKey : event.ctrlKey;
}

interface GlobalShortcutHandlers {
  onSave: () => void;
  onAnalyze?: () => void;
  onNewProject?: () => void;
}

export function useGlobalShortcuts(handlers: GlobalShortcutHandlers): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const mod = isModPressed(event);
      const key = event.key.toLowerCase();
      if (mod && key === "s" && !event.shiftKey) {
        event.preventDefault();
        handlers.onSave();
      } else if (mod && event.shiftKey && key === "k") {
        event.preventDefault();
        handlers.onAnalyze?.();
      } else if (mod && event.shiftKey && key === "n") {
        event.preventDefault();
        handlers.onNewProject?.();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers.onSave, handlers.onAnalyze, handlers.onNewProject]);
}
