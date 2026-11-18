# 开发态启动（Vite + Tauri + Python 后端）
#
# 用法（在仓库根目录）：
#   powershell -ExecutionPolicy Bypass -File scripts\dev-windows.ps1
#
# 说明：开发态下 Rust 侧优先找 src-tauri/binaries/sidecar/accounting-backend.exe，
# 找不到就退回 `python -m accounting_backend.main`，所以不打包也能联调。
param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "[dev] 启动 Tauri 开发窗口（前端 5173 + 后端随机端口）" -ForegroundColor Cyan
& npm run tauri dev
