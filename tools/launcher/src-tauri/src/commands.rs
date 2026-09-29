use crate::app_state::{save_repository, AppState};
use crate::health::{launcher_status, LauncherStatus};
use crate::server_manager;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub fn get_status(state: State<'_, AppState>) -> LauncherStatus {
    launcher_status(&state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn set_repository_path(
    state: State<'_, AppState>,
    repo_path: String,
) -> Result<String, String> {
    let path = PathBuf::from(repo_path.trim())
        .canonicalize()
        .map_err(|error| format!("Repository-Pfad ist nicht erreichbar: {error}"))?;
    let mut data = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    save_repository(&mut data, path)?;
    Ok("Repository-Pfad gespeichert.".into())
}

#[tauri::command]
pub fn start_server(state: State<'_, AppState>) -> Result<String, String> {
    server_manager::start_server(&state)
}

#[tauri::command]
pub fn stop_server(state: State<'_, AppState>) -> Result<String, String> {
    server_manager::stop_server(&state)
}

#[tauri::command]
pub fn restart_server(state: State<'_, AppState>) -> Result<String, String> {
    server_manager::restart_server(&state)
}

#[tauri::command]
pub fn open_workbench() -> Result<(), String> {
    open::that("http://127.0.0.1:3010/wrapt/").map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_logs(state: State<'_, AppState>) -> Result<(), String> {
    let data = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let file = crate::health::log_file(&data.repository);
    crate::health::ensure_log_directory(&data.repository)?;
    if !file.exists() {
        std::fs::File::create(&file).map_err(|error| error.to_string())?;
    }
    open::that(file).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())?;
    } else {
        manager.disable().map_err(|error| error.to_string())?;
    }
    manager.is_enabled().map_err(|error| error.to_string())
}
