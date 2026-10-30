/** 当前项目的只读快照。
 *
 * 放到独立小模块里，避免 analysisStore / econStore 直接 import projectStore
 * （那会形成 store 之间的循环依赖）。
 */

export interface CurrentProjectRef {
  id: string | null;
  name: string | null;
  creator: string | null;
}

let current: CurrentProjectRef = { id: null, name: null, creator: null };

export function setCurrentProjectRef(ref: CurrentProjectRef): void {
  current = ref;
}

export function getCurrentProjectRef(): CurrentProjectRef {
  return current;
}
