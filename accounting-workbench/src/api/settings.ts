import { request } from "./client";
import type { AppSettings, SettingsUpdateResponse } from "../types/api";

/** 当前设置：数据目录、默认目录、项目数。 */
export async function fetchSettings(): Promise<AppSettings> {
  return request<AppSettings>("/api/settings");
}

/**
 * 更改数据目录：后端先迁移数据（复制 → 校验 → 原子替换），成功后才落设置。
 * 旧目录会保留一份，不会删。
 */
export async function updateDataDir(dataDir: string): Promise<SettingsUpdateResponse> {
  return request<SettingsUpdateResponse>("/api/settings", {
    method: "PATCH",
    body: { data_dir: dataDir },
  });
}
