"""用 PyInstaller 把后端打成可随安装包分发的 sidecar。

产物目录：``src-tauri/binaries/sidecar/``（exe + ``_internal/`` 依赖）
之所以用 ``--onedir`` 而不是 ``--onefile``：
  * 单文件模式每次启动都要往 ``%TEMP%`` 解包 100+ MB，慢且容易被安全软件拦；
  * 目录模式直接从只读安装目录读取，启动快、无需临时目录写权限。

用法：
    python backend/build.py             # 构建（覆盖旧产物）
    python backend/build.py --clean     # 先清中间产物
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
ENTRY = BACKEND_DIR / "sidecar_entry.py"
WORK_DIR = BACKEND_DIR / ".pyinstaller"
OUT_DIR = REPO_ROOT / "src-tauri" / "binaries" / "sidecar"
APP_NAME = "accounting-backend"
FONT_DIR = REPO_ROOT / "assets" / "fonts"

# uvicorn / matplotlib 有大量运行期按字符串导入的模块，PyInstaller 静态分析看不到
HIDDEN_IMPORTS = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "matplotlib.backends.backend_agg",
    "openpyxl.cell._writer",
    "xlrd",
    "xlwt",
    "pyarrow",
]


def build(clean: bool) -> Path:
    """执行 PyInstaller 构建并返回可执行文件路径。"""
    if clean and WORK_DIR.exists():
        shutil.rmtree(WORK_DIR)
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.parent.mkdir(parents=True, exist_ok=True)

    separator = ";" if sys.platform == "win32" else ":"
    args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean" if clean else "--noconfirm",
        "--onedir",
        "--name",
        APP_NAME,
        "--distpath",
        str(OUT_DIR.parent),
        "--workpath",
        str(WORK_DIR),
        "--specpath",
        str(WORK_DIR),
        "--add-data",
        f"{FONT_DIR}{separator}assets/fonts",
        "--paths",
        str(BACKEND_DIR),
    ]
    for hidden in HIDDEN_IMPORTS:
        args += ["--hidden-import", hidden]
    args.append(str(ENTRY))

    print("[build] 开始构建 sidecar…")
    subprocess.run(args, check=True, cwd=str(BACKEND_DIR))

    built_dir = OUT_DIR.parent / APP_NAME
    if built_dir.exists() and not OUT_DIR.exists():
        built_dir.replace(OUT_DIR)

    exe = OUT_DIR / (f"{APP_NAME}.exe" if sys.platform == "win32" else APP_NAME)
    if not exe.exists():
        raise SystemExit(f"[build] 产物缺失：{exe}")
    size = sum(item.stat().st_size for item in OUT_DIR.rglob("*") if item.is_file()) / 1024 / 1024
    print(f"[build] 产物：{exe}（目录共 {size:.1f} MB）")
    return exe


def main() -> None:
    """解析参数并构建。"""
    parser = argparse.ArgumentParser(description="构建后端 sidecar（onedir）")
    parser.add_argument("--clean", action="store_true", help="先清理中间产物")
    parsed = parser.parse_args()
    build(parsed.clean)


if __name__ == "__main__":
    main()
