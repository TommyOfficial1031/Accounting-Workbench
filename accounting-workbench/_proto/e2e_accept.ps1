# 静默安装 → 检查文件 → 跑后端 → 静默卸载（端到端验收）
$ErrorActionPreference = "Continue"
$installer = (Resolve-Path "dist-installer\算账工作台-0.1.0-win-x64-lite-setup.exe").Path
$dest = Join-Path (Get-Location) "_proto\_e2e_install"
Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue

"== 1) 静默安装到测试目录 =="
$a = Start-Process -FilePath $installer -ArgumentList "/S", "/D=$dest" -PassThru
if (-not $a.WaitForExit(120000)) { "installer timeout"; $a.Kill(); exit 1 }
"installer exit: $($a.ExitCode)"
Start-Sleep -Seconds 2
if (-not (Test-Path $dest)) { "FAILED: 目录未创建"; exit 1 }

$exe = Join-Path $dest "accounting-workbench.exe"
$sidecar = Join-Path $dest "sidecar\accounting-backend.exe"
"主程序: " + (Test-Path $exe)
"sidecar: " + (Test-Path $sidecar)
"sidecar 文件数: " + (Get-ChildItem (Join-Path $dest "sidecar") -Recurse -File).Count
"快捷方式(桌面): " + (Test-Path (Join-Path ([Environment]::GetFolderPath("Desktop")) "算账工作台.lnk"))

"== 2) 跑安装出来的后端 =="
$home2 = Join-Path (Get-Location) "_proto\_e2e_home"
Remove-Item $home2 -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $home2 | Out-Null
$env:USERPROFILE = $home2
$env:MPLCONFIGDIR = Join-Path $home2 "mpl"
$env:TEMP = $home2
$env:TMP = $home2
$out = Join-Path $home2 "out.txt"
$err = Join-Path $home2 "err.txt"
$p = Start-Process -FilePath $sidecar -PassThru -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError $err
Start-Sleep -Seconds 12
$content = if (Test-Path $out) { Get-Content $out } else { @() }
if (($content -join ' ') -match "PORT=(\d+)") {
    $port = $Matches[1]
    foreach ($path in @("/api/health", "/api/projects")) {
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port$path" -TimeoutSec 10 -UseBasicParsing
            "$path -> $($r.StatusCode)"
        } catch { "$path -> FAILED $($_.Exception.Message)" }
    }
} else {
    "no PORT: $($content -join ' | ')"
    if (Test-Path $err) { "stderr: " + (Get-Content $err -Raw).Substring(0, 300) }
}
if (-not $p.HasExited) { $p.Kill() }

"== 3) 静默卸载 =="
$un = Join-Path $dest "uninstall.exe"
if (Test-Path $un) {
    $u = Start-Process -FilePath $un -ArgumentList "/S" -PassThru
    if (-not $u.WaitForExit(120000)) { "uninstaller timeout"; $u.Kill() }
    Start-Sleep -Seconds 3
    "卸载后目录还在: " + (Test-Path $dest)
} else { "FAILED: 没有 uninstall.exe" }
"done"
