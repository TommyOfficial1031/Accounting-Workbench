"""一键算「网点对比图表」导出成一个文件夹（1 张合并大图 + N 张拆分小图）。

命名规则（用户 2026-10-29 定稿）：

* 文件夹名 = 合并大图名去掉扩展名，形如
  ``网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-29 11：38``；
* 同一分钟重复导出 → 文件夹名追加 ``（2）``、``（3）``…；
* 文件名里的 Windows 非法字符（``\\ / : * ? " < > |``）统一换成「·」，
  与前端 ``src/utils/exportName.ts::safeFileName`` 同一套；时间戳里的半角冒号转全角（坑 4）。

本模块只做格式转换与写盘（``backend/AGENTS.md``：「io/ 只做格式转换」）；渲染一律复用
``chart/builder.py`` 的 ``render_chart_pdf`` / ``render_chart_jpeg``，不再另起 figure。
"""

from __future__ import annotations

import os
import re
import shutil
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

from accounting_backend.chart.builder import render_chart_jpeg, render_chart_pdf
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import ComputeResult
from accounting_backend.schemas.chart import ChartConfig, RenderOpts

_BAD_CHARS = re.compile(r'[\\/:*?"<>|]')
_BLANK_RUN = re.compile(r"\s+")
#: 导出格式 → 扩展名（JPEG 沿用前端一贯的 .jpg，与「导出 JPEG（当前）」提示一致）
_FORMAT_EXT = {"pdf": ".pdf", "jpeg": ".jpg"}


def safe_name(text: str) -> str:
    """Windows 文件名非法字符换成「·」，连续空白压成一个空格，剥掉结尾的点。"""
    cleaned = _BAD_CHARS.sub("·", text)
    cleaned = _BLANK_RUN.sub(" ", cleaned).strip()
    # 结尾的点/空格会被 Windows 静默去掉，先剥掉，免得「真实文件名」和清单不一致
    return cleaned.strip(". ") or "未命名"


@dataclass(frozen=True)
class ChartJob:
    """一张待导出的图：结果表 + 图表配置 + 渲染参数。"""

    result: ComputeResult
    chart: ChartConfig
    render_opts: RenderOpts = field(default_factory=RenderOpts)


def folder_path(out_dir: Path, folder_base: str, stamp: str) -> Path:
    """目标文件夹：``<大图名>_<时间戳>``，已存在则追加 ``（2）``、``（3）``…"""
    # 半角冒号在 Windows 文件名里非法（WinError 267），时间戳统一转全角（坑 4）
    stem = safe_name(f"{folder_base}_{stamp.replace(':', '：')}")
    candidate = out_dir / stem
    index = 2
    while candidate.exists():
        candidate = out_dir / f"{stem}（{index}）"
        index += 1
    return candidate


def _unique_file_name(used: dict[str, int], name: str) -> str:
    """同一批里重名的小图追加 ``（2）``…（多个网点时拆分取值可能撞名）。"""
    base = safe_name(name)
    count = used.get(base, 0)
    used[base] = count + 1
    return base if count == 0 else f"{base}（{count + 1}）"


def export_board_chart_folder(
    merged: ChartJob,
    splits: Sequence[ChartJob],
    out_dir: Path,
    stamp: str,
    folder_base: str,
    file_names: Sequence[str],
    fmt: str,
) -> dict:
    """写一个文件夹：合并大图 + N 张拆分小图，返回 ``{"folder": …, "files": [...]}``。

    ``file_names`` = 合并大图 + 各拆分小图的文件名（**不含扩展名**，顺序与 ``splits`` 对齐）。

    任何一张失败都整批回滚：先写进 ``out_dir`` 里的隐藏暂存目录，全部成功后再原子改名，
    失败时删掉暂存目录，不留半个文件夹。
    """
    extension = _FORMAT_EXT.get(fmt)
    if extension is None:
        raise AccountingError("INVALID_EXPORT_FORMAT", f"不支持的导出格式：{fmt}")

    jobs = [merged, *splits]
    if len(file_names) != len(jobs):
        raise AccountingError(
            "INVALID_EXPORT_CONFIG",
            f"文件名数量（{len(file_names)}）与图的数量（{len(jobs)}）不一致",
        )

    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise AccountingError("EXPORT_WRITE_FAILED", f"无法创建导出目录：{exc}") from exc

    target = folder_path(out_dir, folder_base, stamp)
    staging = out_dir / f".board-export-{uuid.uuid4().hex}"
    render = render_chart_pdf if fmt == "pdf" else render_chart_jpeg
    written: list[str] = []

    try:
        staging.mkdir()
        used: dict[str, int] = {}
        for job, raw_name in zip(jobs, file_names):
            name = _unique_file_name(used, raw_name) + extension
            (staging / name).write_bytes(
                render(job.result, job.chart, job.render_opts)
            )
            written.append(name)
        # 同盘改名是原子的：成功才有文件夹，失败连名字都没出现过
        os.replace(staging, target)
    except AccountingError:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    except OSError as exc:
        shutil.rmtree(staging, ignore_errors=True)
        raise AccountingError("EXPORT_WRITE_FAILED", f"写入文件失败：{exc}") from exc
    except Exception as exc:  # noqa: BLE001 - 渲染异常统一包装，且必须清理暂存目录
        shutil.rmtree(staging, ignore_errors=True)
        raise AccountingError("EXPORT_FAILED", f"导出失败：{exc}") from exc

    return {"folder": str(target), "files": written}
