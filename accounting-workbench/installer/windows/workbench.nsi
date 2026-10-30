; 算账工作台 · Windows 安装包（NSIS）
;
; 特点：
;   * 单用户安装（不需要管理员权限），默认装到 %LOCALAPPDATA%\Programs\AccountingWorkbench
;   * 自带后端 sidecar（Python 已用 PyInstaller 打成 exe，用户机器无需装 Python）
;   * 自带 WebView2 离线安装器：目标机器没有 WebView2 时静默安装，装完即用（无需联网）；
;     装失败会弹提示并给出官网地址（不会假装成功）
;   * 系统要求 Windows 10 或更高版本：低于此版本安装时直接中文提示并退出
;     （Win7 / 8 / 8.1 官方不支持，取证见 HANDOVER_NEXT.md §5）
;   * 卸载时保留用户数据（默认 %USERPROFILE%\.accounting-workbench，设置页可改成自选目录），并提示手动删除
;
; 构建：
;   "C:\path\to\makensis.exe" installer\windows\workbench.nsi

Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"

!define APP_NAME "算账工作台"
!define APP_NAME_EN "Accounting Workbench"
!define APP_VERSION "0.1.0"
!define APP_PUBLISHER "Accounting Workbench"
!define APP_EXE "accounting-workbench.exe"
!define REG_UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\AccountingWorkbench"

; installer\windows\workbench.nsi -> 仓库根目录
!define ROOT "..\.."

Name "${APP_NAME}"
BrandingText "${APP_NAME} ${APP_VERSION}"
!ifdef NOWEBVIEW2
OutFile "${ROOT}\dist-installer\${APP_NAME}-${APP_VERSION}-win-x64-lite-setup.exe"
!else
OutFile "${ROOT}\dist-installer\${APP_NAME}-${APP_VERSION}-win-x64-setup.exe"
!endif
InstallDir "$LOCALAPPDATA\Programs\AccountingWorkbench"
InstallDirRegKey HKCU "Software\AccountingWorkbench" "InstallDir"
RequestExecutionLevel user
SetCompressor lzma

!define MUI_ABORTWARNING
!define MUI_ICON "${ROOT}\src-tauri\icons\icon.ico"
!define MUI_UNICON "${ROOT}\src-tauri\icons\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "立即启动${APP_NAME}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

VIProductVersion "0.1.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=2052 "FileDescription" "${APP_NAME} 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "${APP_PUBLISHER}"

Var WebView2Missing

; 系统版本门槛（第 12 轮 Win10 硬化①）：低于 Windows 10 直接中文提示并退出。
; Win7 / 8 / 8.1 官方不支持 —— accounting-workbench.exe 静态导入 Win8+ API
; （WaitOnAddress / RoOriginateErrorW），Tauri 2 依赖的 WebView2 SDK 也早已不支持 Win7。
; 放在 .onInit：打开安装包第一步就被拦住，不会装到一半才失败。
; 只判主版本（${AtLeastWin10}），1507 / 1607 LTSB 放过 —— 第 12 轮用户拍板的口径。
Function .onInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP|MB_OK "${APP_NAME}需要 Windows 10 或更高版本。$\r$\n$\r$\n当前系统版本过低：Windows 7 / 8 / 8.1 无法运行本软件（程序本身与它依赖的 WebView2 运行时都不再支持）。$\r$\n建议先升级到 Windows 10 / 11，再重新运行本安装包。"
    Abort
  ${EndIf}
FunctionEnd

; 卸载程序不受版本门槛限制（装过就能卸）：定义空 un.onInit，
; 否则 NSIS 在没定义 un.onInit 时会让卸载程序也走上面那段 .onInit。
Function un.onInit
FunctionEnd

; 检测 WebView2 运行时是否已安装（0 = 已安装）
Function CheckWebView2
  StrCpy $WebView2Missing "1"
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 != ""
    StrCpy $WebView2Missing "0"
  ${EndIf}
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 != ""
    StrCpy $WebView2Missing "0"
  ${EndIf}
  ReadRegStr $0 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 != ""
    StrCpy $WebView2Missing "0"
  ${EndIf}
FunctionEnd

Section "主程序" SecMain
  SectionIn RO

  ; 先关掉正在运行的旧版本，避免 accounting-workbench.exe / sidecar 被占用导致写入失败
  DetailPrint "正在关闭已运行的旧版本…"
  nsExec::ExecToLog 'taskkill /IM accounting-workbench.exe /F'
  nsExec::ExecToLog 'taskkill /IM accounting-backend.exe /F'
  Sleep 1200

  SetOutPath "$INSTDIR"

  ; 目录可写性探测：U 盘写保护 / 目录只读 / 权限不足时提前给出明确提示
  ClearErrors
  FileOpen $9 "$INSTDIR\.write-test" w
  ${If} ${Errors}
    MessageBox MB_ICONSTOP|MB_OK "目标目录不可写：$INSTDIR$\r$\n$\r$\n常见原因：选了只读目录 / U 盘写保护 / 需要管理员权限。$\r$\n建议：点上一步换目录（例如默认的 %LOCALAPPDATA%\Programs\AccountingWorkbench），或右键安装包选「以管理员身份运行」。"
    Abort
  ${Else}
    FileClose $9
    Delete "$INSTDIR\.write-test"
  ${EndIf}

  ; 主程序
  File "${ROOT}\src-tauri\target\release\${APP_EXE}"

  ; 后端 sidecar（exe + _internal 依赖目录）
  SetOutPath "$INSTDIR\sidecar"
  File /r "${ROOT}\src-tauri\binaries\sidecar\*.*"

  ; 图标与许可
  SetOutPath "$INSTDIR"
  File "${ROOT}\src-tauri\icons\icon.ico"

  ; WebView2 运行时（离线安装器，仅在缺失时执行）
  ; 编译时加 /DNOWEBVIEW2 可打精简包（不带 205MB 离线运行时）
  Call CheckWebView2
  ${If} $WebView2Missing == "1"
    !ifdef NOWEBVIEW2
      DetailPrint "未内置 WebView2 运行时（精简包），如界面无法打开请先安装 WebView2"
    !else
      DetailPrint "正在安装 WebView2 运行时（离线）…"
      SetOutPath "$INSTDIR"
      File "${ROOT}\.build-tmp\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
      ; 返回码必须接住（第 12 轮 Win10 硬化②）：断网 / 无权限 / 被杀软拦时静默安装会失败，
      ; 原来不看返回码照样提示「完成」，用户装完双击一片空白。
      ; 0 = 成功，3010 = 成功但需重启，1638 = 已装了更高版本 —— 这三个都当成功。
      ExecWait '"$INSTDIR\MicrosoftEdgeWebView2RuntimeInstallerX64.exe" /silent /install' $0
      Delete "$INSTDIR\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
      ${If} $0 == "0"
        ; 返回码说成功也再查一次注册表：静默安装「假成功」时界面一样打不开
        Call CheckWebView2
        ${If} $WebView2Missing == "1"
          MessageBox MB_ICONEXCLAMATION|MB_OK "WebView2 运行时安装程序返回成功，但没有检测到运行时。$\r$\n$\r$\n程序已经装好，但界面可能打不开。$\r$\n请手动安装 Microsoft Edge WebView2 运行时，再重新打开本软件：$\r$\nhttps://developer.microsoft.com/microsoft-edge/webview2/"
        ${EndIf}
      ${ElseIf} $0 == "3010"
        DetailPrint "WebView2 运行时安装成功（返回码 3010：重启后生效）"
      ${ElseIf} $0 == "1638"
        DetailPrint "已存在更高版本的 WebView2 运行时（返回码 1638），跳过"
      ${Else}
        MessageBox MB_ICONEXCLAMATION|MB_OK "WebView2 运行时安装失败（返回码 $0；返回码为空 = 安装程序没能启动，常见是杀毒软件拦截）。$\r$\n$\r$\n程序仍会安装，但界面可能打不开。$\r$\n请先手动安装 Microsoft Edge WebView2 运行时，再重新打开本软件：$\r$\nhttps://developer.microsoft.com/microsoft-edge/webview2/"
      ${EndIf}
    !endif
  ${Else}
    DetailPrint "已检测到 WebView2 运行时，跳过安装"
  ${EndIf}

  ; 快捷方式
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\icon.ico" 0

  ; 卸载信息
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\AccountingWorkbench" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REG_UNINST}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${REG_UNINST}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${REG_UNINST}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${REG_UNINST}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "${REG_UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REG_UNINST}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${REG_UNINST}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${REG_UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${REG_UNINST}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${REG_UNINST}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  ; 卸载前先结束进程（否则删不掉正在运行的 exe）
  nsExec::ExecToLog 'taskkill /IM accounting-workbench.exe /F'
  nsExec::ExecToLog 'taskkill /IM accounting-backend.exe /F'
  Sleep 800

  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"

  RMDir /r "$INSTDIR\sidecar"
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "${REG_UNINST}"
  DeleteRegKey HKCU "Software\AccountingWorkbench"

  ; 用户数据保留（projects.db / parquet 缓存），仅提示路径
  MessageBox MB_ICONINFORMATION|MB_OK "卸载完成。$\r$\n$\r$\n你的项目数据保留在你自选的数据目录（默认是：$\r$\n$PROFILE\.accounting-workbench）。$\r$\n如果改过数据目录，请以「设置 → 数据 → 数据目录」显示的路径为准；$\r$\n如需彻底清除，请手动删除该文件夹。"
SectionEnd
