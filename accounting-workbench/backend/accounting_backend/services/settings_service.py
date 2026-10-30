"""数据目录设置与迁移。

编排顺序（需求：不能半迁移）：

1. 校验目标目录（不是当前目录、不互相嵌套、可写、里面没有旧工作台数据）；
2. 把当前数据目录**复制**到目标目录里的临时目录 ``.aw-migrate-*``；
3. 校验（文件数 + SQLite 行数），不一致直接失败并清掉临时目录；
4. 逐项 ``os.replace`` 搬进目标根目录（同盘 = 原子重命名），任何一步失败就回滚；
5. 最后才写设置指针 ``%APPDATA%\\accounting-workbench\\settings.json``。

旧目录从头到尾只读不改，迁移完仍然完整保留一份。
"""

from __future__ import annotations

import os
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Optional

from accounting_backend.errors import AccountingError
from accounting_backend.storage import paths

#: 不迁移的东西：日志 / matplotlib 字体缓存 / 设置指针本身
_SKIP_NAMES = ("logs", ".mplcache", paths.SETTINGS_FILE_NAME)
#: 目标目录里出现这些名字 = 已经有工作台数据，拒绝迁移（不合并、不覆盖）
_CONFLICT_NAMES = ("projects.db", "projects", "datasets")
#: SQLite 库文件名（用 backup API 复制，避免漏掉 WAL 里未落盘的事务）
_DB_NAME = "projects.db"
#: 迁移后要抽查行数的表
_VERIFY_TABLES = ("projects", "export_records")
_STAGING_PREFIX = ".aw-migrate-"


def _is_ignored_name(name: str) -> bool:
    """迁移/统计时统一忽略的文件名（日志、缓存、配置、SQLite 临时文件、暂存目录）。"""
    return (
        name in _SKIP_NAMES
        or name == _DB_NAME
        or name.startswith(_STAGING_PREFIX)
        or name.endswith(("-wal", "-shm", "-journal"))
    )


def _in_ignored_scope(root: Path, item: Path) -> bool:
    try:
        parts = item.relative_to(root).parts
    except ValueError:
        return False
    return any(_is_ignored_name(part) for part in parts)


def _dir_stats(root: Path) -> tuple[int, int]:
    """返回（文件数, 字节数），忽略日志/缓存/库文件；非目录返回 (0, 0)。"""
    if not root.is_dir():
        return (0, 0)
    files = 0
    total = 0
    for item in root.rglob("*"):
        if _in_ignored_scope(root, item):
            continue
        try:
            if not item.is_file():
                continue
            total += item.stat().st_size
        except OSError:
            continue
        files += 1
    return (files, total)


def _table_count(db: Path, table: str) -> Optional[int]:
    """返回某张表的行数；文件/表不存在或打不开时返回 None。"""
    if not db.is_file():
        return None
    try:
        conn = sqlite3.connect(str(db))
    except sqlite3.Error:
        return None
    try:
        found = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
        ).fetchone()
        if found is None:
            return None
        return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    except sqlite3.Error:
        return None
    finally:
        conn.close()


def _project_count(db: Path) -> int:
    return _table_count(db, "projects") or 0


def _copy_database(source: Path, destination: Path) -> None:
    """用 SQLite backup API 复制项目库（含 WAL 里已提交但未 checkpoint 的事务）。"""
    source_conn = sqlite3.connect(str(source))
    try:
        destination_conn = sqlite3.connect(str(destination))
        try:
            source_conn.backup(destination_conn)
        finally:
            destination_conn.close()
    finally:
        source_conn.close()


def _verify_database(source: Path, staged: Path) -> None:
    """复制后抽查表行数，少一行就判定迁移失败（绝不半迁移）。"""
    if not source.is_file():
        return
    if not staged.is_file():
        raise AccountingError(
            "DATA_DIR_MIGRATE_FAILED",
            "迁移失败：项目库没有复制过去",
            status_code=500,
        )
    for table in _VERIFY_TABLES:
        expected = _table_count(source, table)
        actual = _table_count(staged, table)
        if expected is not None and actual != expected:
            raise AccountingError(
                "DATA_DIR_MIGRATE_FAILED",
                f"迁移校验失败：{table} 应为 {expected} 行，实际 {actual} 行",
                details={"table": table, "expected": expected, "actual": actual},
                status_code=500,
            )


def _probe_writable(target: Path) -> None:
    """真写一个探针文件，确认目标目录可写（比 os.access 可靠）。"""
    probe = target / ".aw-write-test"
    try:
        probe.write_text("ok", encoding="utf-8")
    except OSError as exc:
        raise AccountingError(
            "DATA_DIR_NOT_WRITABLE",
            f"目标目录不可写：{target}（{exc}）",
            details={"path": str(target)},
        ) from exc
    finally:
        try:
            probe.unlink()
        except OSError:
            pass


def _canonical(path: Path) -> Path:
    """规范化路径；Windows 下路径含非法字符时给明确的 400，而不是 500 堆栈。"""
    try:
        return Path(paths.canonical_path(path))
    except OSError as exc:
        raise AccountingError(
            "DATA_DIR_INVALID", f"路径不合法：{path}（{exc}）"
        ) from exc


def _same_path(left: Path, right: Path) -> bool:
    """比较两个路径是否同一位置（规范化失败时退回字符串比较）。"""
    try:
        return paths.canonical_path(left) == paths.canonical_path(right)
    except OSError:
        return str(left) == str(right)


def _ensure_not_overlapping(current: Path, target: Path) -> None:
    """当前目录与目标目录不能相同、不能互相包含。"""
    current_key = _canonical(current)
    target_key = _canonical(target)
    if current_key == target_key:
        raise AccountingError(
            "DATA_DIR_UNCHANGED", f"数据目录已经是这个位置：{target}"
        )
    if current_key in target_key.parents:
        raise AccountingError(
            "DATA_DIR_INVALID", "目标目录不能在当前数据目录里面（会自己复制自己）"
        )
    if target_key in current_key.parents:
        raise AccountingError(
            "DATA_DIR_INVALID", "目标目录不能包含当前数据目录"
        )


def _reject_existing_data(target: Path) -> None:
    """目标目录里已经躺着工作台数据就拒绝（避免新旧项目混进一个库）。"""
    found = [name for name in _CONFLICT_NAMES if (target / name).exists()]
    if found:
        raise AccountingError(
            "DATA_DIR_NOT_EMPTY",
            f"目标目录已有工作台数据（{'、'.join(found)}），请换一个空目录",
            details={"conflicts": found},
        )


def _copy_data(current: Path, staging: Path) -> int:
    """把当前数据目录复制到暂存目录，返回复制过去的文件数。"""
    try:
        shutil.copytree(current, staging, ignore=shutil.ignore_patterns(
            *[name for name in _SKIP_NAMES],
            _DB_NAME,
            "*.db-wal",
            "*.db-shm",
            "*.db-journal",
            f"{_STAGING_PREFIX}*",
        ))
    except shutil.Error as exc:
        raise AccountingError(
            "DATA_DIR_MIGRATE_FAILED",
            f"迁移失败：有文件复制不过去（{len(exc.args[0]) if exc.args else 0} 个）",
            details={"errors": [str(item) for item in (exc.args[0] if exc.args else [])][:5]},
            status_code=500,
        ) from exc
    database = current / _DB_NAME
    if database.is_file():
        _copy_database(database, staging / _DB_NAME)
    return sum(1 for item in staging.rglob("*") if item.is_file())


def _verify_copy(current: Path, staging: Path) -> None:
    """文件数逐个对齐才算复制成功。"""
    source_files, _ = _dir_stats(current)
    staged_files, _ = _dir_stats(staging)
    if source_files != staged_files:
        raise AccountingError(
            "DATA_DIR_MIGRATE_FAILED",
            f"迁移校验失败：源目录 {source_files} 个文件，目标只有 {staged_files} 个",
            details={"expected": source_files, "actual": staged_files},
            status_code=500,
        )
    _verify_database(current / _DB_NAME, staging / _DB_NAME)


def _remove_paths(items: list[Path]) -> None:
    for item in items:
        try:
            if item.is_dir() and not item.is_symlink():
                shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink()
        except OSError:
            continue


def _discard_staging(staging: Path) -> None:
    if staging.exists():
        shutil.rmtree(staging, ignore_errors=True)


def _move_into_place(staging: Path, target: Path) -> list[Path]:
    """把暂存内容逐项原子搬进目标根目录；失败则删掉已搬的副本（旧目录从未被改）。"""
    if not staging.exists():
        # 还没有任何数据（全新安装）：没有暂存目录可搬，直接算成功
        return []
    pending = sorted(staging.iterdir(), key=lambda item: item.name)
    collisions = [item.name for item in pending if (target / item.name).exists()]
    if collisions:
        raise AccountingError(
            "DATA_DIR_NOT_EMPTY",
            f"目标目录里已有同名内容（{'、'.join(collisions[:3])}），请换一个空目录",
            details={"conflicts": collisions},
        )
    moved: list[Path] = []
    try:
        for item in pending:
            destination = target / item.name
            os.replace(item, destination)
            moved.append(destination)
    except OSError as exc:
        _remove_paths(moved)
        raise AccountingError(
            "DATA_DIR_MIGRATE_FAILED", f"迁移失败：写入目标目录出错（{exc}）", status_code=500
        ) from exc
    _discard_staging(staging)
    return moved


def get_settings_info() -> dict:
    """当前设置：数据目录、默认目录、是否默认、项目数。"""
    current = paths.get_data_dir()
    default = paths.get_default_data_dir()
    return {
        "data_dir": str(current),
        "default_data_dir": str(default),
        "is_default": _same_path(current, default),
        "project_count": _project_count(current / _DB_NAME),
    }


def change_data_dir(raw_target: str) -> dict:
    """把数据目录切到 ``raw_target``，迁移完才生效；返回迁移结果。"""
    text = (raw_target or "").strip()
    if text == "":
        raise AccountingError("DATA_DIR_INVALID", "请选择一个数据目录")
    target = Path(text).expanduser()
    if not target.is_absolute():
        raise AccountingError("DATA_DIR_INVALID", f"请选择绝对路径的数据目录：{text}")

    current = paths.get_data_dir()
    _ensure_not_overlapping(current, target)
    if target.exists() and not target.is_dir():
        raise AccountingError("DATA_DIR_INVALID", f"目标路径不是文件夹：{target}")
    try:
        target.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise AccountingError(
            "DATA_DIR_NOT_WRITABLE", f"无法创建目标目录：{target}（{exc}）"
        ) from exc

    _probe_writable(target)
    _reject_existing_data(target)

    staging = target / f"{_STAGING_PREFIX}{time.strftime('%Y%m%d%H%M%S')}-{os.getpid()}"
    copied = 0
    moved: list[Path] = []
    try:
        if current.is_dir():
            copied = _copy_data(current, staging)
            _verify_copy(current, staging)
            moved = _move_into_place(staging, target)
    except AccountingError:
        _discard_staging(staging)
        raise
    except (OSError, sqlite3.Error) as exc:
        _discard_staging(staging)
        raise AccountingError(
            "DATA_DIR_MIGRATE_FAILED", f"迁移失败：{exc}", status_code=500
        ) from exc

    try:
        paths.set_data_dir(target)
    except OSError as exc:
        # 设置没写成功 = 迁移没生效：把刚搬过去的副本删掉，旧目录本来就没动过
        _remove_paths(moved)
        _discard_staging(staging)
        raise AccountingError(
            "DATA_DIR_SETTINGS_FAILED",
            f"数据已复制到 {target}，但保存设置失败（{exc}），已回滚，仍在原目录",
            status_code=500,
        ) from exc

    paths.ensure_dirs()
    return {
        "data_dir": str(target),
        "previous_dir": str(current),
        "copied_files": copied,
        "kept_previous": current.is_dir(),
    }
