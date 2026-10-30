import { useState } from "react";
import { useAnalysisStore } from "./analysisStore";
import { useDirtyStore } from "./dirtyStore";
import { useProjectStore } from "./projectStore";

export interface SavePrompt {
  onProceed: () => void;
}

// 打开/删除项目前的「未保存修改」守卫，供项目管理页与历史记录窗口复用。
export function useSaveGuard() {
  const [savePrompt, setSavePrompt] = useState<SavePrompt | null>(null);
  const clearDirty = useDirtyStore((state) => state.clearDirty);

  function withSaveGuard(onProceed: () => void): void {
    if (useDirtyStore.getState().dirty) {
      setSavePrompt({ onProceed });
    } else {
      onProceed();
    }
  }

  async function saveAndProceed(onProceed: () => void): Promise<void> {
    const config = useAnalysisStore.getState().buildConfig();
    const result = useAnalysisStore.getState().result;
    const id = useProjectStore.getState().currentProject?.id;
    if (id && config) {
      await useProjectStore.getState().saveCurrentProject(config, result);
    } else {
      clearDirty();
    }
    setSavePrompt(null);
    onProceed();
  }

  function discardAndProceed(onProceed: () => void): void {
    clearDirty();
    setSavePrompt(null);
    onProceed();
  }

  function closeSavePrompt(): void {
    setSavePrompt(null);
  }

  return { savePrompt, withSaveGuard, saveAndProceed, discardAndProceed, closeSavePrompt };
}
