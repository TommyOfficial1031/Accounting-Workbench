"""设置（数据目录）的 Pydantic 模型（字段名与前端 types/api.ts 一致）。"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class SettingsInfo(BaseModel):
    """当前设置：数据目录 + 项目数。"""

    data_dir: str
    default_data_dir: str
    is_default: bool
    project_count: int


class DataDirUpdateRequest(BaseModel):
    """PATCH /api/settings：选择新的数据目录（Tauri 目录对话框给的绝对路径）。"""

    data_dir: str


class DataDirMigration(BaseModel):
    """迁移结果：新位置、旧位置（保留）、复制了多少文件。"""

    data_dir: str
    previous_dir: str
    copied_files: int
    kept_previous: bool


class SettingsUpdateResponse(BaseModel):
    settings: SettingsInfo
    migration: Optional[DataDirMigration] = None
