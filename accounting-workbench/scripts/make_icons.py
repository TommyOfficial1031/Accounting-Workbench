"""生成「算账工作台」的计算器图标（深色线稿 / 圆角机身 + 显示屏 + 4 键）。

用法（Python 3.9 + Pillow，项目里用 E:\\python3.9.6\\python.exe）：

    # 出 3 版候选（1024 原图 + 256 预览 + 3 联张），交用户挑
    python scripts/make_icons.py candidates

    # 挑定后按某一版出全套：assets/icon/<variant>/ 下 16/24/32/48/64/128/256/512/1024
    python scripts/make_icons.py render A

    # 打包用的大图（tauri icon 的输入）
    python scripts/make_icons.py master A

图标几何按 1024×1024 设计，所有尺寸都用 4 倍超采样后缩下来，16px 也清楚。
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ── 配色（浅色卡片 + 深色线稿，深浅任务栏都能认出来）──
INK = (29, 29, 31, 255)          # #1d1d1f 深色线稿
INK_SOFT = (110, 110, 115, 255)  # #6e6e73
CARD = (255, 255, 255, 255)
CARD_EDGE = (210, 210, 215, 255)
DARK_BODY = (30, 30, 32, 255)
DARK_CARD = (245, 245, 247, 255)
ACCENT = (0, 113, 227, 255)      # 主色（只用在「等号」这类小点缀）

BASE = 1024
SUPERSAMPLE = 4

# 几何（基于 1024 画布）
BODY = (236, 140, 788, 900)
BODY_R = 112
SCREEN = (312, 212, 712, 364)
SCREEN_R = 28
KEY = 168
KEY_R = 30
KEY_X = (312, 544)
KEY_Y = (436, 668)


def _scaled(value: float, scale: int) -> int:
    return int(round(value * scale))


def _body_box(scale: int) -> tuple[int, int, int, int]:
    left, top, right, bottom = BODY
    return (
        _scaled(left, scale),
        _scaled(top, scale),
        _scaled(right, scale),
        _scaled(bottom, scale),
    )


def _screen_box(scale: int) -> tuple[int, int, int, int]:
    left, top, right, bottom = SCREEN
    return (
        _scaled(left, scale),
        _scaled(top, scale),
        _scaled(right, scale),
        _scaled(bottom, scale),
    )


def _key_boxes(scale: int) -> list[tuple[int, int, int, int]]:
    boxes: list[tuple[int, int, int, int]] = []
    for top in KEY_Y:
        for left in KEY_X:
            boxes.append(
                (
                    _scaled(left, scale),
                    _scaled(top, scale),
                    _scaled(left + KEY, scale),
                    _scaled(top + KEY, scale),
                )
            )
    return boxes


def _draw_screen_hint(draw: ImageDraw.ImageDraw, scale: int, colour: tuple[int, ...]) -> None:
    """屏幕里画两行「数字」：上短下长、上左对齐下右对齐，像一块正在显示数的计算器屏。"""
    left, top, right, bottom = _screen_box(scale)
    width = _scaled(24, scale)
    inset = _scaled(44, scale)
    span = right - left - inset * 2
    top_y = int(round(top + (bottom - top) * 0.38))
    bottom_y = int(round(top + (bottom - top) * 0.66))
    draw.line(
        [(left + inset, top_y), (left + inset + int(span * 0.32), top_y)],
        fill=colour,
        width=width,
    )
    draw.line(
        [(right - inset - int(span * 0.52), bottom_y), (right - inset, bottom_y)],
        fill=colour,
        width=width,
    )


def _fit_to_canvas(image: Image.Image, fill: float = 0.88) -> Image.Image:
    """把画好的内容裁到包围盒，再按比例放大到画布的 fill（图标不留大片空白，小尺寸更清楚）。"""
    bbox = image.getbbox()
    if bbox is None:
        return image
    content = image.crop(bbox)
    target = int(round(BASE * fill))
    ratio = min(target / content.width, target / content.height)
    width = max(1, int(round(content.width * ratio)))
    height = max(1, int(round(content.height * ratio)))
    scaled = content.resize((width, height), Image.LANCZOS)
    canvas = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    canvas.alpha_composite(scaled, ((BASE - width) // 2, (BASE - height) // 2))
    return canvas


def draw_variant(variant: str, size: int = BASE) -> Image.Image:
    """输出 size×size 的透明底图标。"""
    scale = SUPERSAMPLE
    canvas = Image.new("RGBA", (BASE * scale, BASE * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    stroke = _scaled(46, scale)
    body = _body_box(scale)
    screen = _screen_box(scale)
    keys = _key_boxes(scale)

    if variant == "A":  # 浅色卡片 + 纯线稿（最干净）
        draw.rounded_rectangle(
            body,
            radius=_scaled(BODY_R, scale),
            fill=CARD,
            outline=INK,
            width=stroke,
        )
        draw.rounded_rectangle(
            screen,
            radius=_scaled(SCREEN_R, scale),
            fill=None,
            outline=INK,
            width=_scaled(36, scale),
        )
        _draw_screen_hint(draw, scale, INK)
        for box in keys:
            draw.rounded_rectangle(
                box,
                radius=_scaled(KEY_R, scale),
                fill=None,
                outline=INK,
                width=_scaled(38, scale),
            )

    elif variant == "B":  # 块面感：屏幕实心、4 键实心
        draw.rounded_rectangle(
            body,
            radius=_scaled(BODY_R, scale),
            fill=CARD,
            outline=INK,
            width=stroke,
        )
        draw.rounded_rectangle(
            screen,
            radius=_scaled(SCREEN_R, scale),
            fill=INK,
            outline=INK,
            width=_scaled(30, scale),
        )
        _draw_screen_hint(draw, scale, CARD)
        for index, box in enumerate(keys):
            fill = INK if index != 3 else ACCENT
            draw.rounded_rectangle(
                box,
                radius=_scaled(KEY_R, scale),
                fill=fill,
                outline=fill,
                width=_scaled(8, scale),
            )

    elif variant == "C":  # 深色机身 + 亮色线稿（深色底更显眼）
        draw.rounded_rectangle(
            body,
            radius=_scaled(BODY_R, scale),
            fill=DARK_BODY,
            outline=DARK_BODY,
            width=stroke,
        )
        draw.rounded_rectangle(
            screen,
            radius=_scaled(SCREEN_R, scale),
            fill=DARK_CARD,
            outline=DARK_CARD,
            width=_scaled(30, scale),
        )
        _draw_screen_hint(draw, scale, INK)
        for box in keys:
            draw.rounded_rectangle(
                box,
                radius=_scaled(KEY_R, scale),
                fill=None,
                outline=DARK_CARD,
                width=_scaled(38, scale),
            )

    elif variant == "D":  # C 的变体：深色机身 + 主色屏幕
        draw.rounded_rectangle(
            body,
            radius=_scaled(BODY_R, scale),
            fill=DARK_BODY,
            outline=DARK_BODY,
            width=stroke,
        )
        draw.rounded_rectangle(
            screen,
            radius=_scaled(SCREEN_R, scale),
            fill=ACCENT,
            outline=ACCENT,
            width=_scaled(30, scale),
        )
        _draw_screen_hint(draw, scale, CARD)
        for box in keys:
            draw.rounded_rectangle(
                box,
                radius=_scaled(KEY_R, scale),
                fill=DARK_CARD,
                outline=DARK_CARD,
                width=_scaled(8, scale),
            )

    else:
        raise SystemExit(f"未知版本：{variant}（可选 A / B / C / D）")

    master = _fit_to_canvas(canvas.resize((BASE, BASE), Image.LANCZOS))
    if size == BASE:
        return master
    return master.resize((size, size), Image.LANCZOS)


def write_contact_sheet(variants: list[str], out_path: Path, tile: int = 256) -> None:
    """把候选拼成一张对比图（下面标注版本字母）。"""
    padding = 32
    label_height = 56
    width = padding + (tile + padding) * len(variants)
    height = padding + tile + label_height
    sheet = Image.new("RGBA", (width, height), (246, 246, 248, 255))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, variant in enumerate(variants):
        icon = draw_variant(variant, tile)
        x = padding + index * (tile + padding)
        sheet.alpha_composite(icon, (x, padding))
        draw.text((x + tile // 2 - 4, padding + tile + 16), variant, fill=INK, font=font)
    sheet.convert("RGB").save(out_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="算账工作台图标生成器")
    parser.add_argument("action", choices=["candidates", "render", "master"])
    parser.add_argument("variant", nargs="?", default="A")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    icon_root = root / "assets" / "icon"

    if args.action == "candidates":
        target = icon_root / "candidates"
        target.mkdir(parents=True, exist_ok=True)
        variants = ["A", "B", "C"]
        for variant in variants:
            draw_variant(variant, BASE).save(target / f"candidate-{variant}-1024.png")
            draw_variant(variant, 256).save(target / f"candidate-{variant}-256.png")
        write_contact_sheet(variants, target / "candidates.png")
        print(f"候选图标输出到 {target}")
        return

    if args.action == "master":
        target = icon_root / args.variant
        target.mkdir(parents=True, exist_ok=True)
        path = target / "icon-1024.png"
        draw_variant(args.variant, BASE).save(path)
        print(path)
        return

    target = Path(args.out) if args.out else icon_root / args.variant
    target.mkdir(parents=True, exist_ok=True)
    for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
        path = target / f"{size}x{size}.png"
        draw_variant(args.variant, size).save(path)
        print(path)


if __name__ == "__main__":
    main()
