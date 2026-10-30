"""Filesystem path helpers for local storage.

All persisted artifacts live under a single per-user **data directory** so that no
other module hard-codes a filesystem path (AGENTS.md 禁止事项 #5).

The data directory itself is user-configurable（设置 → 数据 → 更改目录）. The pointer
that remembers the choice must live *outside* that directory, otherwise it would
have to describe itself. It sits in a fixed per-user config directory:

    Windows : ``%APPDATA%\\accounting-workbench\\settings.json``
    else    : ``$XDG_CONFIG_HOME/accounting-workbench/settings.json``
              (fallback ``~/.config/accounting-workbench/settings.json``)

``ACCOUNTING_WORKBENCH_CONFIG_DIR`` overrides the config directory (tests / e2e
  scripts use it so they never touch the real user profile).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

#: 程序目录名（配置目录 / 安装目录都用它，保持文件名一致）
APP_DIR_NAME = "accounting-workbench"
#: 默认数据目录（老版本写死的那个），用户没改设置时就用它
DEFAULT_DATA_DIR_NAME = ".accounting-workbench"
#: 记录用户自选数据目录的配置文件名
SETTINGS_FILE_NAME = "settings.json"
#: 把配置目录指到别处（测试 / e2e 隔离用）
ENV_CONFIG_DIR = "ACCOUNTING_WORKBENCH_CONFIG_DIR"

#: get_data_dir() 的进程内缓存；改设置后必须同步刷新
_data_dir_cache: Optional[Path] = None


def get_resource_root() -> Path:
    """Return the base directory that holds bundled read-only resources.

    In development this is the repository root (``assets/`` lives there). In a
    PyInstaller one-file build everything is unpacked into ``sys._MEIPASS``, so
    ``assets/fonts`` must be resolved against that directory instead.
    """
    frozen_dir = getattr(sys, "_MEIPASS", None)
    if frozen_dir:
        return Path(frozen_dir)
    # backend/accounting_backend/storage/paths.py -> repo root
    return Path(__file__).resolve().parents[3]


def get_config_dir() -> Path:
    """Return the fixed per-user config directory (never the data directory)."""
    override = os.environ.get(ENV_CONFIG_DIR, "").strip()
    if override:
        return Path(override).expanduser()
    if os.name == "nt":
        appdata = os.environ.get("APPDATA", "").strip()
        if appdata:
            return Path(appdata) / APP_DIR_NAME
    xdg = os.environ.get("XDG_CONFIG_HOME", "").strip()
    if xdg:
        return Path(xdg) / APP_DIR_NAME
    return Path.home() / ".config" / APP_DIR_NAME


def get_settings_file() -> Path:
    """Return the JSON file that remembers the chosen data directory."""
    return get_config_dir() / SETTINGS_FILE_NAME


def read_app_settings() -> dict[str, Any]:
    """Read the app settings JSON; unreadable / corrupt files yield an empty dict."""
    path = get_settings_file()
    try:
        raw = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def write_app_settings(values: dict[str, Any]) -> None:
    """Atomically write the app settings JSON (temp file + ``os.replace``)."""
    path = get_settings_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{SETTINGS_FILE_NAME}.tmp")
    tmp.write_text(json.dumps(values, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def get_default_data_dir() -> Path:
    """Return the default data directory (``~/.accounting-workbench``)."""
    return Path.home() / DEFAULT_DATA_DIR_NAME


def get_data_dir() -> Path:
    """Return the root data directory (user-chosen, default ``~/.accounting-workbench``)."""
    global _data_dir_cache
    if _data_dir_cache is None:
        configured = read_app_settings().get("data_dir")
        chosen = str(configured).strip() if isinstance(configured, str) else ""
        _data_dir_cache = Path(chosen).expanduser() if chosen else get_default_data_dir()
    return _data_dir_cache


def set_data_dir(path: Path | str) -> Path:
    """Persist a new data directory and refresh the in-process cache."""
    global _data_dir_cache
    target = Path(path).expanduser()
    values = read_app_settings()
    values["data_dir"] = str(target)
    write_app_settings(values)
    _data_dir_cache = target
    return target


def reset_data_dir_cache() -> None:
    """Forget the cached data directory (tests / external config edits)."""
    global _data_dir_cache
    _data_dir_cache = None


def canonical_path(path: Path | str) -> str:
    """Return a normalized path string for equality / nesting checks."""
    return os.path.normcase(str(Path(path).expanduser().resolve()))


def is_default_data_dir() -> bool:
    """Whether the active data directory is the built-in default."""
    return canonical_path(get_data_dir()) == canonical_path(get_default_data_dir())


def get_datasets_dir() -> Path:
    """Return the directory that holds cached parquet datasets."""
    return get_data_dir() / "datasets"


def get_dataset_path(dataset_id: str) -> Path:
    """Return the parquet path for a dataset id."""
    return get_datasets_dir() / f"{dataset_id}.parquet"


def get_projects_dir() -> Path:
    """Return the directory that holds per-project cache directories."""
    return get_data_dir() / "projects"


def get_project_dir(project_id: str) -> Path:
    """Return the per-project cache directory."""
    return get_projects_dir() / project_id


def get_project_parquet_path(project_id: str) -> Path:
    """Return the project data parquet path."""
    return get_project_dir(project_id) / "data.parquet"


def get_project_result_path(project_id: str) -> Path:
    """Return the project result cache JSON path."""
    return get_project_dir(project_id) / "result.json"


def get_projects_db_path() -> Path:
    """Return the SQLite database path for project metadata."""
    return get_data_dir() / "projects.db"


def ensure_dirs() -> None:
    """Create the data directories if they do not already exist."""
    get_datasets_dir().mkdir(parents=True, exist_ok=True)
    get_projects_dir().mkdir(parents=True, exist_ok=True)
