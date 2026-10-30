# 算账工作台 · 打包与安装说明

> 目标：做出「发给别人、对方断网也能装、装完即用」的安装包。
> 关键点：**Python 后端必须先打成 exe 随包带走**（用户机器不装 Python），
> Windows 还要自带 **WebView2 离线安装器**（否则老旧机器打不开界面）。

## 一、产物在哪

| 平台 | 产物 | 位置 |
|---|---|---|
| Windows（正式） | 安装包（NSIS，含 WebView2 离线运行时，断网可装） | `dist-installer/算账工作台-0.1.0-win-x64-setup.exe`（300 MB） |
| Windows（精简） | 不带 WebView2 运行时（目标机已有 WebView2 时可用） | `dist-installer/算账工作台-0.1.0-win-x64-lite-setup.exe`（95 MB） |
| macOS | `.dmg`（含 `.app`） | `src-tauri/target/release/bundle/dmg/` |

安装后的目录结构（Windows 默认装到 `%LOCALAPPDATA%\Programs\AccountingWorkbench`）：

```
AccountingWorkbench\
├── accounting-workbench.exe     # Tauri 前端壳（界面已内嵌）
├── icon.ico
├── uninstall.exe
└── sidecar\                     # Python 后端（PyInstaller onedir）
    ├── accounting-backend.exe
    └── _internal\               # 依赖（含 Noto 中文字体）
```

用户数据（项目库、缓存）默认在 `%USERPROFILE%\.accounting-workbench`，
卸载**不会**删除。想换位置就在「设置 → 数据 → 更改目录」里选一个新目录：
程序会把项目库 / 项目缓存 / 导出记录复制过去再切换，**旧目录会保留一份**；
卸载完弹窗提示的就是「你自选的数据目录」（默认仍是上面那个路径）。

## 二、Windows：一条命令出安装包

```powershell
# 前置：Node 18+、Rust（stable）、Python 3.9+ 且已装后端依赖与 PyInstaller
python -m pip install fastapi "uvicorn[standard]" pandas numpy matplotlib openpyxl pyarrow "xlrd==1.2.0" xlwt pyinstaller

# 构建（后端 sidecar → 前端 → Tauri release → NSIS 安装包）
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

细节：
1. `backend/build.py` 用 PyInstaller `--onedir` 产出 `src-tauri/binaries/sidecar/`
   （**不用 onefile**：单文件每次启动都要往 `%TEMP%` 解包 100+ MB，慢且容易被安全软件拦）。
2. `npm run build` 产出 `dist/`，Tauri 把它内嵌进 exe。
3. `npm run tauri build` 产出 `src-tauri/target/release/accounting-workbench.exe`。
4. `installer/windows/workbench.nsi` 用 NSIS 打安装包：
   主程序 + `sidecar\` + WebView2 离线安装器（仅在缺失时静默安装）+ 开始菜单/桌面快捷方式 + 卸载项。

> 若本机没有 NSIS，可先把 `nsis-3.11.zip` 解包到 `.build-tmp\nsis\`，用
> `.build-tmp\nsis\nsis-3.11\makensis.exe installer\windows\workbench.nsi` 手动打包。
> （tauri 自带下载器访问 github.com，被墙时会失败，改用本地 NSIS 更稳。）

精简包（不带 205 MB 的 WebView2 离线运行时）：

```powershell
& ".build-tmp\nsis\nsis-3.11\makensis.exe" /DNOWEBVIEW2 installer\windows\workbench.nsi
```

## 三、macOS：本期不做（用户 2026-10-23 确认）

只交付 Windows 安装包。`scripts/build-macos.sh` 与 `.github/workflows/release.yml`
保留在仓库里备用（PyInstaller 不能交叉编译，`.dmg` 必须在 Mac 上产出），
本期不维护、不验收。

<details>
<summary>以后要做 macOS 时的步骤（备用）</summary>

**只能在 macOS 上构建**，因为 PyInstaller 不能交叉编译，Tauri 的 `.dmg` 也依赖 macOS
自带的 `hdiutil` / `codesign`。环境齐了以后：

```bash
xcode-select --install
python3 -m pip install fastapi "uvicorn[standard]" pandas numpy matplotlib openpyxl pyarrow "xlrd==1.2.0" xlwt pyinstaller
bash scripts/build-macos.sh
```

产物：`src-tauri/target/release/bundle/dmg/`. 未签名时用户首次打开要右键→打开，
或 `xattr -dr com.apple.quarantine /Applications/算账工作台.app`。

</details>

## 四、离线安装是怎么保证的

| 依赖 | 处理方式 |
|---|---|
| Python 运行时与三方库 | PyInstaller 打进 `sidecar\`，用户机器无需 Python |
| 中文字体（Noto Sans CJK） | 随 sidecar 一起打包（`assets/fonts` → `_internal/assets/fonts`） |
| WebView2（Windows 界面内核） | 安装包里内置 205 MB 离线安装器，缺失时静默安装；Win11/新版 Win10 一般已有，会自动跳过 |
| 网络 | 安装与运行**全程不需要联网** |

## 五、体积与优化空间

当前 Windows 安装包约 **299 MB**（WebView2 离线安装器 205 MB + 后端 90 MB）。
如需瘦身，可选：

1. 去掉 WebView2 离线安装器，改带 2 MB 的在线 bootstrapper（目标机首次需要联网）；
2. 精简 sidecar：排除未用到的 pyarrow / matplotlib 字体缓存 / 测试依赖，可降到 ~60 MB；
3. 后端改 onefile + 关闭不用的 pandas 可选组件（不建议，启动变慢）。

## 六、安装时提示「无法打开要写入的文件」怎么办

现象：安装到某一步弹出

```
无法打开要写入的文件："<安装目录>\accounting-workbench.exe"
点击 [Abort] 停止安装，[Retry] 重新尝试写入文件，或者 [Ignore] 忽略这个文件。
```

原因按可能性排序：

1. **上一次装好的程序还在运行**（`accounting-workbench.exe` 或 `sidecar\accounting-backend.exe`
   占着文件，Windows 不允许覆盖正在运行的 exe）；
2. **目标目录本身不可写**：U 盘写保护 / 选到了只读目录 / 目录属主是管理员而当前是普通用户
   （判断方法：在同一目录里新建一个 txt 保存，如果也失败，就是目录问题，不是安装包问题）；
3. 杀毒软件（360、火绒等）正在扫描或拦截这个 exe。

安装包现在（2026-10-24 起）做了两道保护：

- 开始拷贝前先 **探测目录可写性**，不可写就直接弹窗说明原因并让你换目录（不再拷到一半失败）；
- 拷贝旧主程序前先 **结束旧进程 → 清只读属性 → 失败则改名**，覆盖安装不会再卡在这一步。

若仍失败，按下面顺序处理：

1. 换安装目录（推荐默认目录 `%LOCALAPPDATA%\Programs\AccountingWorkbench`，或 `D:\` 下自建目录）；
2. 右键安装包 → **以管理员身份运行**；
3. 手动清掉旧目录：在命令提示符里执行
   `attrib -R -S -H "E:\AccountingWorkbench\accounting-workbench.exe"` 后删除该文件夹；
4. 确认 E: 盘不是写保护（U 盘侧面开关）或空间已满。

旧的原因描述（保留）：

原因：**上一次装好的程序还在运行**（`accounting-workbench.exe` 或 `sidecar\accounting-backend.exe`
占着文件，Windows 不允许覆盖正在运行的 exe）；次要原因是杀毒软件正在扫描该文件。

处理（任选其一）：

1. **最简单**：在任务管理器里结束 `算账工作台` / `accounting-workbench.exe` / `accounting-backend.exe`，
   回到安装窗口点「重试」。
2. 点「中止」，确认那个目录里没有正在运行的程序，再用安装包重装一遍。
3. 若目标目录在 U 盘 / 只读盘 / 受控目录（如 `E:\` 根下的自建文件夹），换到默认目录
   （`%LOCALAPPDATA%\Programs\AccountingWorkbench`）或 `D:\` 再装。

> 2026-10-24 起的安装包已经内置「**安装前自动结束旧进程**」（`taskkill /IM accounting-workbench.exe /F`、
> `taskkill /IM accounting-backend.exe /F`，失败也不打断安装），正常不会再卡在这一步；
> 卸载脚本也加了同样的处理，避免删不掉正在运行的 exe。

## 六、验证结果（2026-10-23 实测，正式包与精简包各跑一遍）

自动化脚本：`_proto/e2e_accept.ps1`（静默安装 → 检查文件 → 跑装出来的后端 → 静默卸载）

| 检查项 | 正式包（300 MB） | 精简包（95 MB） |
|---|---|---|
| 静默安装退出码 | 0 | 0 |
| 主程序 `accounting-workbench.exe` | 有 | 有 |
| `sidecar\accounting-backend.exe` | 有（2357 个文件） | 有（2357 个文件） |
| 桌面快捷方式「算账工作台」 | 已创建 | 已创建 |
| 装出来的后端 `/api/health` | 200 | 200 |
| 装出来的后端 `/api/projects` | 200 | 200 |
| 静默卸载后目录 | 已清空 | 已清空 |

仍需人工确认的部分（自动化跑不了 GUI）：启动后界面是否正常渲染、导入 xlsx、两页计算、导出文件夹、
关窗口后 sidecar 是否随主程序退出。
