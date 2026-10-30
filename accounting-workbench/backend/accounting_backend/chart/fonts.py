"""中文字体注册与获取（Noto Sans CJK SC）。"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from matplotlib import font_manager
from matplotlib.font_manager import FontProperties

from accounting_backend.storage.paths import get_resource_root

_FONT_NAME = "NotoSansCJKsc-Regular.otf"

_registered = False


@lru_cache(maxsize=1)
def get_font_path() -> Path:
    """返回随包分发的字体路径（开发态在仓库根，打包后从 _MEIPASS 解出）。"""
    return get_resource_root() / "assets" / "fonts" / _FONT_NAME


def register_fonts() -> None:
    """把 Noto Sans CJK SC 注册到 matplotlib（幂等）。"""
    global _registered
    if _registered:
        return
    font_path = get_font_path()
    if font_path.exists():
        font_manager.fontManager.addfont(str(font_path))
    _registered = True


def get_cjk_font() -> FontProperties:
    """返回显式指定 CJK 字体的 FontProperties，不依赖系统字体。"""
    register_fonts()
    font_path = get_font_path()
    if font_path.exists():
        return FontProperties(fname=str(font_path))
    return FontProperties(family="sans-serif")


def cjk_font(size: Optional[float] = None) -> FontProperties:
    """返回指定字号的 CJK FontProperties（每次新建，调用方随便改不会影响别人）。"""
    register_fonts()
    font_path = get_font_path()
    kwargs: dict = {"fname": str(font_path)} if font_path.exists() else {"family": "sans-serif"}
    if size is not None:
        kwargs["size"] = size
    return FontProperties(**kwargs)
