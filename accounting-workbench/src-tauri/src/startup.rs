//! 启动环境探测：WebView2 运行时在不在、启动失败怎么让用户看见。
//!
//! 为什么需要它（第 12 轮 Win10 硬化补丁③）：
//! - release 版是 `windows_subsystem = "windows"`，**没有控制台**：原来那句
//!   `.expect("error while running tauri application")` 的 panic 用户完全看不见，
//!   表现就是「双击没反应」；
//! - 安装包虽然会补装离线 WebView2，但用户可能手动卸载、精简包没装、装到一半断电 / 断网，
//!   这时 WebView2 缺失 → Tauri 建不出窗口 → 一样是静默退出。
//!
//! 这里只做「启动环境」判断（注册表探测 + 原生消息框），不碰任何业务与数据（见 src-tauri/AGENTS.md）。

use std::ffi::c_void;

#[cfg(windows)]
use winreg::RegKey;
#[cfg(windows)]
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};

/// 产品名，只用于消息框标题与正文（与 `tauri.conf.json` 的 `productName` 一致）。
const APP_NAME: &str = "算账工作台";

/// WebView2 运行时的官方下载页：装不上时给用户一条能自己走的路。
const WEBVIEW2_DOWNLOAD: &str = "https://developer.microsoft.com/microsoft-edge/webview2/";

/// WebView2 Runtime 的注册表位置（与 `installer/windows/workbench.nsi::CheckWebView2` 同一套）。
#[cfg(windows)]
const WEBVIEW2_CLIENTS: &str =
    r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

/// 32 位进程视角下的同一位置（安装包也会读这一处）。
#[cfg(windows)]
const WEBVIEW2_CLIENTS_WOW: &str =
    r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

/// 读取已安装的 WebView2 运行时版本；没装返回 `None`。
///
/// 三处注册表任一有非空 `pv` 就算已安装：HKLM 64 位、HKLM WOW6432Node、
/// HKCU（WebView2 的「单用户安装」写这里，普通用户也能装）。
#[cfg(windows)]
pub fn webview2_version() -> Option<String> {
    let candidates = [
        (HKEY_LOCAL_MACHINE, WEBVIEW2_CLIENTS_WOW),
        (HKEY_LOCAL_MACHINE, WEBVIEW2_CLIENTS),
        (HKEY_CURRENT_USER, WEBVIEW2_CLIENTS),
    ];
    for (root, path) in candidates {
        let key = match RegKey::predef(root).open_subkey_with_flags(path, KEY_READ) {
            Ok(key) => key,
            Err(_) => continue,
        };
        // `pv` 存的是「120.0.2210.91」这种版本号；空字符串视为没装（安装包同款判断）
        if let Ok(version) = key.get_value::<String, _>("pv") {
            if !version.trim().is_empty() {
                return Some(version);
            }
        }
    }
    None
}

/// 非 Windows 平台没有 WebView2（macOS 用系统 WebKit），恒视为「已就绪」。
#[cfg(not(windows))]
pub fn webview2_version() -> Option<String> {
    Some(String::new())
}

/// 启动前检查：失败时返回「可以直接给用户看的中文说明」。
pub fn check_startup_environment() -> Result<(), String> {
    match webview2_version() {
        Some(_) => Ok(()),
        None => Err(webview2_missing_message()),
    }
}

/// 缺少 WebView2 时的说明（附下载地址 + 重装建议）。
pub fn webview2_missing_message() -> String {
    [
        format!("缺少 Microsoft Edge WebView2 运行时，{APP_NAME}无法显示界面。"),
        String::new(),
        "请先安装 Microsoft Edge WebView2 运行时，再重新打开本软件：".to_string(),
        WEBVIEW2_DOWNLOAD.to_string(),
        String::new(),
        "如果刚刚装过本软件，重新运行一次安装包也会自动补装（完整包自带离线运行时）；".to_string(),
        "装完不用重启电脑，直接再双击一次本软件即可。".to_string(),
    ]
    .join("\r\n")
}

/// 应用启动失败（`run()` 返回 Err，比如窗口/运行时初始化失败）时的说明。
pub fn startup_failure_message(detail: &str) -> String {
    [
        format!("{APP_NAME}启动失败，界面没有创建出来。"),
        String::new(),
        format!("错误信息：{detail}"),
        String::new(),
        "可以依次试：".to_string(),
        "1. 重新运行安装包修复（会自动补装 WebView2 运行时）；".to_string(),
        format!("2. 手动安装 Microsoft Edge WebView2 运行时：{WEBVIEW2_DOWNLOAD}"),
        r"3. 仍然打不开时，把 %APPDATA%\accounting-workbench\logs\sidecar.log 一起反馈。".to_string(),
    ]
    .join("\r\n")
}

/// 应用启动时 panic（Tauri 内部建 WebView 失败、系统资源被占用等）时的说明。
///
/// 第 12 轮实测到的真实场景：用户已经开着一个窗口，再双击一次，
/// WebView2 因为数据目录被占用直接 panic（`HRESULT(0x800700AA) 请求的资源在使用中`），
/// release 版没有控制台 → 用户看到的就是「双击没反应」。
pub fn startup_panic_message(detail: &str, location: &str) -> String {
    [
        format!("{APP_NAME}启动失败，界面没有创建出来。"),
        String::new(),
        format!("错误信息：{detail}"),
        format!("出错位置：{location}"),
        String::new(),
        "可以依次试：".to_string(),
        "1. 如果已经打开了一个算账工作台窗口，先关掉它再打开（同一时间只能开一份）；".to_string(),
        "2. 重新运行安装包修复（会自动补装 WebView2 运行时）；".to_string(),
        format!("3. 手动安装 Microsoft Edge WebView2 运行时：{WEBVIEW2_DOWNLOAD}"),
        r"4. 仍然打不开时，把 %APPDATA%\accounting-workbench\logs\sidecar.log 一起反馈。".to_string(),
    ]
    .join("\r\n")
}

/// 安装 panic 钩子：任何 panic 都先弹原生消息框，再交给默认处理（debug 版照旧打印 backtrace）。
///
/// 为什么必须有它：`run()` 只把「返回 Err」的失败交给调用方，而 Tauri 建 WebView 失败是
/// **panic**（`tauri/src/app.rs` 里的 `failed to create webview`），原来这条路径在
/// release 下完全不显示 —— 正是用户报的「双击没反应」。
pub fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info.payload();
        let detail = if let Some(text) = payload.downcast_ref::<&str>() {
            (*text).to_string()
        } else if let Some(text) = payload.downcast_ref::<String>() {
            text.clone()
        } else {
            "未知错误".to_string()
        };
        let location = match info.location() {
            Some(location) => format!("{}:{}", location.file(), location.line()),
            None => "未知位置".to_string(),
        };
        // 先让用户看见（阻塞式消息框），再走默认钩子把 backtrace 打到 stderr
        show_fatal(&startup_panic_message(&detail, &location));
        default_hook(info);
    }));
}

/// 启动阶段的致命错误：**必须弹原生消息框**（release 版没有控制台，只 `eprintln!` 等于没提示）。
///
/// 这里没有用 `tauri_plugin_dialog`：WebView2 缺失时 Tauri 应用还没建起来，拿不到
/// `AppHandle`；直接用 Win32 `MessageBoxW`，让「启动前」和「启动后」两条失败路径走同一处。
pub fn show_fatal(message: &str) {
    // debug 版（`tauri dev`）的控制台还留着，顺手打一份方便排查
    eprintln!("[startup] {message}");
    show_native_message(APP_NAME, message);
}

/// 弹一个阻塞式原生错误框（点掉才会继续往下执行）。
#[cfg(windows)]
fn show_native_message(caption: &str, message: &str) {
    const MB_OK: u32 = 0x0000_0000;
    const MB_ICONERROR: u32 = 0x0000_0010;
    const MB_SETFOREGROUND: u32 = 0x0001_0000;
    const MB_TOPMOST: u32 = 0x0004_0000;

    // user32 是系统 DLL，Rust 的 MSVC target 不会默认链接，这里显式声明
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut c_void,
            text: *const u16,
            caption: *const u16,
            u_type: u32,
        ) -> i32;
    }

    /// Rust 字符串 → NUL 结尾的 UTF-16（MessageBoxW 只认 wide 字符串）
    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let text = wide(message);
    let title = wide(caption);
    // SAFETY: 两个指针都指向以 NUL 结尾、调用期间一直存活的 UTF-16 缓冲
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR | MB_SETFOREGROUND | MB_TOPMOST,
        );
    }
}

/// 非 Windows 平台没有 `MessageBoxW`：退化成 stderr（macOS 从终端启动时仍能看到原因）。
#[cfg(not(windows))]
fn show_native_message(caption: &str, message: &str) {
    eprintln!("[{caption}] {message}");
}
