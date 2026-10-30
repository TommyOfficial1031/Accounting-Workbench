import { create } from "zustand";

// 独立于各业务 store 的「未保存修改」标记，避免循环依赖。
interface DirtyState {
  dirty: boolean;
  markDirty: () => void;
  clearDirty: () => void;
}

export const useDirtyStore = create<DirtyState>((set) => ({
  dirty: false,
  markDirty: () => set({ dirty: true }),
  clearDirty: () => set({ dirty: false }),
}));
