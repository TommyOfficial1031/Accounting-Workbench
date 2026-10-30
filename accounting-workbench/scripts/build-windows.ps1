# 一键构建 Windows 安装包（前端 + 后端 sidecar + Tauri NSIS）
#
# 用法（在仓库根目录）：
#   powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -SkipSidecar
#
# 前置：Node 16+/npm、Rust toolchain、Python 3.9+ 已装 fastapi/pandas/matplotlib/pyinstaller。
param(
    [switch]$SkipSidecar,
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "[1/3] 构建后端 sidecar（PyInstaller onedir）" -ForegroundColor Cyan
if ($SkipSidecar) {
    Write-Host "  跳过（沿用 src-tauri/binaries/sidecar）" -ForegroundColor DarkGray
} else {
    & $Python "backend/build.py"
    if ($LASTEXITCODE -ne 0) { throw "后端 sidecar 构建失败" }
}

Write-Host "[2/3] 构建前端（tsc + vite）" -ForegroundColor Cyan
& npm run build
if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }

Write-Host "[3/3] 打包安装包（Tauri NSIS）" -ForegroundColor Cyan
& npm run tauri build
if ($LASTEXITCODE -ne 0) { throw "安装包打包失败" }

$bundle = Join-Path $root "src-tauri/target/release/bundle/nsis"
$installer = Get-ChildItem $bundle -Filter *.exe -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($installer) {
    Write-Host "`n安装包：$($installer.FullName)（$([math]::Round($installer.Length / 1MB, 1)) MB）" -ForegroundColor Green
} else {
    Write-Host "`n未找到 NSIS 产物，请检查 src-tauri/target/release/bundle/nsis" -ForegroundColor Yellow
}
