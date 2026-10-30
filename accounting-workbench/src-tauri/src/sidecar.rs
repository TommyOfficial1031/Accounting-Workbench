use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager};

/// Shared state between the Tauri shell and the Python sidecar.
#[derive(Default)]
pub struct SidecarState {
    port: Arc<Mutex<Option<u16>>>,
    child: Arc<Mutex<Option<Child>>>,
}

impl SidecarState {
    /// Return the backend port once the sidecar has announced it.
    pub fn port(&self) -> Option<u16> {
        *self.port.lock().expect("sidecar port lock poisoned")
    }

    fn store_child(&self, child: Child) {
        *self.child.lock().expect("sidecar child lock poisoned") = Some(child);
    }
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// File name of the packaged backend executable.
fn sidecar_file_name() -> &'static str {
    if cfg!(windows) {
        "accounting-backend.exe"
    } else {
        "accounting-backend"
    }
}

/// Locate the packaged sidecar: ``<resources>/sidecar/accounting-backend``.
///
/// The installer copies ``src-tauri/binaries/sidecar`` into the app resources,
/// so the executable sits next to its ``_internal`` dependency folder and never
/// needs to unpack anything at runtime.
fn packaged_sidecar(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("sidecar").join(sidecar_file_name()));
    }
    // Custom installers may place the resources next to the executable instead
    // of the Tauri resource directory, so check that location as well.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("sidecar").join(sidecar_file_name()));
        }
    }
    // ``tauri dev`` runs from src-tauri/target/<profile>/, so fall back to the
    // build output when the app is not installed yet.
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join("sidecar")
            .join(sidecar_file_name()),
    );
    candidates.into_iter().find(|candidate| candidate.is_file())
}

/// Development fallback: run the backend straight from the Python sources.
fn dev_python_command() -> Option<Command> {
    let backend_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()?
        .join("backend");
    if !backend_dir.join("accounting_backend").is_dir() {
        return None;
    }
    let mut command = Command::new("python");
    command
        .arg("-m")
        .arg("accounting_backend.main")
        .current_dir(backend_dir);
    Some(command)
}

/// Spawn the backend sidecar and watch its stdout for the port announcement.
pub fn spawn_backend(app: &AppHandle, state: &SidecarState) -> Result<(), String> {
    let mut command = match packaged_sidecar(app) {
        Some(exe) => {
            let mut command = Command::new(&exe);
            command.current_dir(exe.parent().map(Path::to_path_buf).unwrap_or_default());
            command
        }
        None => dev_python_command()
            .ok_or_else(|| "找不到后端程序（既没有打包产物，也没有 backend/ 源码）".to_string())?,
    };

    // The backend is a console executable (PyInstaller default). Without this
    // flag Windows would open a visible console window next to the app.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to spawn backend sidecar: {error}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "sidecar stdout handle is missing".to_string())?;

    // Drain stderr into a log file so uvicorn output never blocks on a full
    // pipe and support can inspect what happened on a user machine.
    if let Some(stderr) = child.stderr.take() {
        let log_path = crate::sidecar::sidecar_log_path();
        std::thread::spawn(move || {
            use std::io::Write;
            let mut sink = log_path
                .and_then(|path| {
                    if let Some(parent) = path.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(path)
                        .ok()
                });
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                if let Some(file) = sink.as_mut() {
                    let _ = writeln!(file, "{line}");
                }
            }
        });
    }

    let port_state = Arc::clone(&state.port);
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut announced = false;
        for line in reader.lines().map_while(Result::ok) {
            if !announced {
                if let Some(port) = parse_port(&line) {
                    *port_state.lock().expect("port lock poisoned") = Some(port);
                    announced = true;
                }
            }
            // Keep consuming stdout for the lifetime of the child instead of
            // breaking after ``PORT=``. Dropping the reader would close the
            // pipe and make the backend's stdout logging (e.g. uvicorn access
            // logs) fail with a broken-pipe error.
        }
    });

    state.store_child(child);
    Ok(())
}

/// Parse a ``PORT=<port>`` line emitted by the backend.
fn parse_port(line: &str) -> Option<u16> {
    line.strip_prefix("PORT=")?.trim().parse().ok()
}

/// Where the sidecar's stderr goes: ``%APPDATA%\accounting-workbench\logs\sidecar.log``.
///
/// Logs live in the per-user config directory (the same place as the backend's
/// ``settings.json``), never in the data directory: the data directory is user
/// chosen and may live on another drive, and keeping logs out of it means
/// changing the data directory never leaves a stray ``logs/`` folder behind.
pub fn sidecar_log_path() -> Option<PathBuf> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("USERPROFILE")
                .or_else(|| std::env::var_os("HOME"))
                .map(|home| PathBuf::from(home).join(".config"))
        })?;
    Some(
        base.join("accounting-workbench")
            .join("logs")
            .join("sidecar.log"),
    )
}
