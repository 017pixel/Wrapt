use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::State;

use crate::app_state::AppState;

static CLIENT: OnceLock<Client> = OnceLock::new();
const HEALTH_URL: &str = "http://127.0.0.1:3010/api/v1/health";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub app_name: String,
    pub boot_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherStatus {
    pub reachable: bool,
    pub version: Option<String>,
    pub boot_id: Option<String>,
    pub ownership: String,
    pub repository: String,
    pub log_file: String,
    pub desired: bool,
    pub last_error: Option<String>,
}

pub fn fetch_health() -> Option<HealthResponse> {
    let client = CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(Duration::from_millis(800))
            .build()
            .expect("HTTP-Client")
    });
    client
        .get(HEALTH_URL)
        .send()
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .ok()
}

pub fn server_port_is_open() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], 3010));
    TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok()
}

pub fn launcher_status(state: &State<'_, AppState>) -> LauncherStatus {
    let health = fetch_health();
    let reachable = health.is_some();
    let data = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    LauncherStatus {
        reachable,
        version: health.as_ref().map(|value| value.version.clone()),
        boot_id: health.as_ref().map(|value| value.boot_id.clone()),
        ownership: (if data.child.is_some() {
            "managed"
        } else if reachable {
            "external"
        } else {
            "stopped"
        })
        .into(),
        repository: data.repository.to_string_lossy().into_owned(),
        log_file: log_file(&data.repository).to_string_lossy().into_owned(),
        desired: data.desired,
        last_error: data.last_error.clone(),
    }
}

pub fn log_file(repository: &std::path::Path) -> PathBuf {
    data_directory(repository)
        .join("launcher")
        .join("server.log")
}

pub fn ensure_log_directory(repository: &std::path::Path) -> Result<PathBuf, String> {
    let file = log_file(repository);
    let directory = file.parent().unwrap_or_else(|| std::path::Path::new("."));
    std::fs::create_dir_all(directory)
        .map_err(|error| format!("Logordner konnte nicht angelegt werden: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Logordner konnte nicht geschützt werden: {error}"))?;
    }
    Ok(directory.to_path_buf())
}

fn data_directory(repository: &std::path::Path) -> PathBuf {
    if let Some(path) = std::env::var_os("WRAPT_DATA_DIR").map(PathBuf::from) {
        return path;
    }
    let config = repository.join("config/wrapt.local.json");
    if let Ok(bytes) = std::fs::read(config) {
        if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            if let Some(path) = value
                .pointer("/paths/dataDir")
                .and_then(serde_json::Value::as_str)
            {
                let expanded = expand_home(path);
                if expanded.is_absolute() && !path.contains("your-user") {
                    return expanded;
                }
            }
        }
    }
    default_data_directory()
}

fn expand_home(path: &str) -> PathBuf {
    if path == "~" || path.starts_with("~/") {
        if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            return PathBuf::from(home).join(path.trim_start_matches("~/"));
        }
    }
    PathBuf::from(path)
}

fn default_data_directory() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        #[cfg(windows)]
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            return PathBuf::from(local).join("Wrapt");
        }
        #[cfg(not(windows))]
        return PathBuf::from(home).join(".local/share/wrapt");
        #[cfg(windows)]
        return PathBuf::from(home).join("AppData/Local/Wrapt");
    }
    PathBuf::from("data")
}
