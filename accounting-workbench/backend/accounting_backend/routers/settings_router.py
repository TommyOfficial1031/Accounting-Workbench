"""HTTP 端点：设置（数据目录）。

``GET /api/settings`` 读当前设置；``PATCH /api/settings`` 改数据目录并迁移数据。
路径与 AGENTS.md §8.3 一致，不新增未定义的 API。
"""

from __future__ import annotations

from fastapi import APIRouter

from accounting_backend.config import API_PREFIX
from accounting_backend.schemas.settings import (
    DataDirMigration,
    DataDirUpdateRequest,
    SettingsInfo,
    SettingsUpdateResponse,
)
from accounting_backend.services import settings_service

router = APIRouter(prefix=API_PREFIX)


@router.get("/settings")
def get_settings() -> SettingsInfo:
    """当前设置：数据目录、默认目录、项目数。"""
    return SettingsInfo(**settings_service.get_settings_info())


@router.patch("/settings")
def update_settings(request: DataDirUpdateRequest) -> SettingsUpdateResponse:
    """更改数据目录：先迁移数据，成功后才落设置（旧目录保留）。"""
    migration = settings_service.change_data_dir(request.data_dir)
    return SettingsUpdateResponse(
        settings=SettingsInfo(**settings_service.get_settings_info()),
        migration=DataDirMigration(**migration),
    )
