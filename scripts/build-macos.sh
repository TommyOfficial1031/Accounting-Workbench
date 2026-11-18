#!/usr/bin/env bash
# 一键构建 macOS 安装包（.dmg + .app）
#
# 只能在 macOS 上运行：PyInstaller 不能交叉编译，Tauri 的 dmg/app 打包也依赖
# macOS 自带的 clang / hdiutil / codesign。
#
# 用法（在仓库根目录）：
#   bash scripts/build-macos.sh                # 当前架构
#   bash scripts/build-macos.sh --universal    # Intel + Apple Silicon 通用包
#
# 前置：Xcode Command Line Tools、Node 18+、Rust、Python 3.9+
#       （python3 -m pip install fastapi uvicorn pandas numpy matplotlib openpyxl pyarrow xlrd==1.2.0 xlwt pyinstaller）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-python3}"
UNIVERSAL=0
for arg in "$@"; do
  case "$arg" in
    --universal) UNIVERSAL=1 ;;
  esac
done

echo "[1/3] 构建后端 sidecar（PyInstaller onedir）"
"$PYTHON" backend/build.py

echo "[2/3] 构建前端（tsc + vite）"
npm run build

echo "[3/3] 打包（Tauri dmg + app）"
if [ "$UNIVERSAL" -eq 1 ]; then
  # 通用包：先把 rust 目标都装上，再让 PyInstaller 产物覆盖两次架构不现实，
  # 因此通用包只保证前端/Rust 侧通用；sidecar 需在两个架构上各打一次再合并。
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  npm run tauri build -- --target universal-apple-darwin
else
  npm run tauri build
fi

echo
echo "产物目录：src-tauri/target/release/bundle/dmg/"
ls -lh src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || true
