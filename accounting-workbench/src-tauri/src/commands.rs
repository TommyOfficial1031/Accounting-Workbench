use std::path::PathBuf;
use std::process::Command;

use tauri::State;

use crate::sidecar::SidecarState;

/// Expose the backend port to the frontend.
#[tauri::command]
pub fn get_backend_port(state: State<'_, SidecarState>) -> Option<u16> {
    state.port()
}

fn require_exists(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("路径为空".to_string());
    }
    let target = PathBuf::from(trimmed);
    if !target.exists() {
        return Err(format!("路径不存在：{trimmed}"));
    }
    Ok(target)
}

/// 用系统默认程序打开一个文件（导出文件管理页的「打开文件」）。
#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    let target = require_exists(&path)?;
    if target.is_dir() {
        return open_folder(path);
    }

    #[cfg(target_os = "windows")]
    {
        // .pdf/.xlsx 这类文件用 start 会走默认关联程序；空标题参数不能省
        Command::new("cmd")
            .args(["/C", "start", "", target.to_string_lossy().as_ref()])
            .spawn()
            .map_err(|error| format!("打开失败：{error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|error| format!("打开失败：{error}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|error| format!("打开失败：{error}"))?;
        Ok(())
    }
}

/// 在资源管理器中定位：文件 → 选中它；文件夹 → 直接进入（导出文件管理页的「打开路径」）。
#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let target = require_exists(&path)?;

    #[cfg(target_os = "windows")]
    {
        let argument = if target.is_dir() {
            target.to_string_lossy().to_string()
        } else {
            format!("/select,{}", target.to_string_lossy())
        };
        Command::new("explorer")
            .arg(argument)
            .spawn()
            .map_err(|error| format!("打开失败：{error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        if target.is_dir() {
            Command::new("open")
                .arg(&target)
                .spawn()
                .map_err(|error| format!("打开失败：{error}"))?;
        } else {
            Command::new("open")
                .args(["-R"])
                .arg(&target)
                .spawn()
                .map_err(|error| format!("打开失败：{error}"))?;
        }
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let folder = if target.is_dir() {
            target
        } else {
            target
                .parent()
                .map(|parent| parent.to_path_buf())
                .unwrap_or(target)
        };
        Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|error| format!("打开失败：{error}"))?;
        Ok(())
    }
}
