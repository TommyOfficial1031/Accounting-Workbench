/**
 * 盈亏平衡分组的纯函数工具（第 11 轮）。
 *
 * 两件事都靠这里，不再切 `" · "` 标签字符串：
 * - 「卡片数 = 图表数」：后端返回多少组就显示多少组（第 11 轮前被 `slice(0, 6/8)` 截断）；
 * - 「按省份统一写成本」：用后端新给的 `RegressionGroup.parts` 按省份归组，
 *   再把一个值写进该省全部卡片的政策里。
 */
import type { RegressionGroup, RegressionTableResult } from "../types/api";

/** 省份维度字段名（与后端 `_cascade_child` / 盈亏平衡页一致）。 */
export const PROVINCE_FIELD = "目的所属省份";
/** 公斤段维度字段名。 */
export const BAND_FIELD = "公斤段";
/** 网点维度字段名。 */
export const NET_FIELD = "寄件所属一级网点";

/** 卡片与图表共用的分组：有几组显示几组（第 11 轮 A③ 删掉两处 slice 上限）。
 *
 * 返回**同一个空数组常量**而不是每次 `[]`：这个值的身份会进 useEffect 依赖，
 * 每次新建对象会让 effect 每帧重跑（坑 1：React effect 死循环）。 */
const NO_GROUPS: RegressionGroup[] = [];
export function visibleGroups(table: RegressionTableResult | null): RegressionGroup[] {
  return table?.groups ?? NO_GROUPS;
}

/** 分组所属省份；老数据没有 `parts`（或该维度没参与）时返回 null。 */
export function provinceOf(group: RegressionGroup): string | null {
  const value = group.parts?.[PROVINCE_FIELD];
  return value !== undefined && value.trim() !== "" ? value : null;
}

export interface ProvinceGroup {
  province: string;
  /** 该省的全部卡片键（= group.label，写政策用） */
  labels: string[];
}

/** 按省份归组（顺序 = 后端返回顺序，即「省份 → 网点 → 公斤段」的展开顺序）。 */
export function provinceGroups(groups: RegressionGroup[]): ProvinceGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, string[]>();
  for (const group of groups) {
    const province = provinceOf(group);
    if (province === null) continue;
    const existing = buckets.get(province);
    if (existing === undefined) {
      buckets.set(province, [group.label]);
      order.push(province);
    } else {
      existing.push(group.label);
    }
  }
  return order.map((province) => ({ province, labels: buckets.get(province) ?? [] }));
}

/** 政策草稿（与 `stores/econStore.ts::PolicyDraft` 结构一致，四个都是输入框原始字符串）。 */
export interface PolicyDraftLike {
  c_line: string;
  op_cost: string;
  d_plan: string;
  z_plan: string;
}

export const EMPTY_POLICY_DRAFT: PolicyDraftLike = {
  c_line: "",
  op_cost: "",
  d_plan: "",
  z_plan: "",
};

/**
 * 把一个值写进一组卡片的政策里（「按省份统一写成本」= 覆盖该省全部卡片）。
 *
 * 只改给定的 key，其余字段原样保留；返回新对象（不改入参）。
 * 之后单卡再改仍然是普通的 `updatePolicy`，只影响那一张（用户 2026-10-29 定稿）。
 */
export function applyCostToLabels(
  policies: Record<string, PolicyDraftLike>,
  labels: string[],
  key: "c_line" | "op_cost",
  value: string,
): Record<string, PolicyDraftLike> {
  const next: Record<string, PolicyDraftLike> = { ...policies };
  for (const label of labels) {
    next[label] = { ...(next[label] ?? EMPTY_POLICY_DRAFT), [key]: value };
  }
  return next;
}

/**
 * 一组卡片在该字段上的「共同值」：全都一样就返回它，否则 null（界面显示「多个值」）。
 * 统一区的输入框靠它显示当前状态，不做额外的本地状态。
 */
export function commonPolicyValue(
  policies: Record<string, PolicyDraftLike>,
  labels: string[],
  key: keyof PolicyDraftLike,
): string | null {
  if (labels.length === 0) return null;
  const first = policies[labels[0]]?.[key] ?? "";
  for (const label of labels) {
    if ((policies[label]?.[key] ?? "") !== first) return null;
  }
  return first;
}
