#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod menu;
mod sidecar;
mod startup;

use tauri::{Emitter, Manager};

use sidecar::SidecarState;

fn main() {
    // 任何 panic 都要让用户看见（第 12 轮 Win10 硬化）：release 版没有控制台，
    // Tauri 建 WebView 失败走的是 panic 而不是 Err（例如已经开着一份、WebView2 数据目录被占用）。
    startup::install_panic_hook();

    // 启动环境检查：WebView2 缺失时 Tauri 连窗口都建不出来，
    // 而 release 版没有控制台 —— 不在这里拦一道，用户看到的就是「双击没反应」。
    if let Err(message) = startup::check_startup_environment() {
        startup::show_fatal(&message);
        std::process::exit(1);
    }

    // 原来的 `.expect("error while running tauri application")` 在无控制台 release 下
    // 等于把错误吞掉：这里改成拿到 Result 后弹原生消息框，用户至少知道发生了什么。
    if let Err(error) = run_app() {
        startup::show_fatal(&startup::startup_failure_message(&error.to_string()));
        std::process::exit(1);
    }
}

fn run_app() -> tauri::Result<()> {
    let sidecar_state = SidecarState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(sidecar_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_backend_port,
            commands::open_file,
            commands::open_folder
        ])
        // 拖文件进窗口：Tauri 自己会发 `tauri://drag-drop`，这里再补一条自定义事件，
        // 前端两条通道都听（用户 2026-10-28 反馈：首页「将文件拖到此处创建新项目」没反应）。
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                let files: Vec<String> = paths
                    .iter()
                    .map(|path| path.to_string_lossy().to_string())
                    .collect();
                let _ = window.emit("aw://file-dropped", files);
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let managed = app.state::<SidecarState>();
            if let Err(error) = sidecar::spawn_backend(&handle, managed.inner()) {
                eprintln!("[sidecar] failed to spawn backend: {error}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
}
