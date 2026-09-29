use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Deserialize, Serialize)]
struct SavedConfig {
    repository: String,
}

pub struct AppState {
    pub inner: Mutex<LauncherData>,
}

pub struct LauncherData {
    pub repository: PathBuf,
    pub config_file: PathBuf,
    pub child: Option<Child>,
    pub desired: bool,
    pub last_error: Option<String>,
    pub last_launch: Option<Instant>,
    pub termination_deadline: Option<Instant>,
    pub early_exits: u8,
}

impl AppState {
    pub fn load(app: &AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let config_dir = app.path().app_config_dir()?;
        std::fs::create_dir_all(&config_dir)?;
        let config_file = config_dir.join("launcher.json");
        let repository = read_repository(&config_file).unwrap_or_else(default_repository);
        Ok(Self {
            inner: Mutex::new(LauncherData {
                repository,
                config_file,
                child: None,
                desired: false,
                last_error: None,
                last_launch: None,
                termination_deadline: None,
                early_exits: 0,
            }),
        })
    }
}

fn read_repository(file: &Path) -> Option<PathBuf> {
    let saved: SavedConfig = serde_json::from_slice(&std::fs::read(file).ok()?).ok()?;
    let path = PathBuf::from(saved.repository);
    is_wrapt_repository(&path).then_some(path)
}

fn default_repository() -> PathBuf {
    let mut candidates = Vec::new();
    if let Some(value) = std::env::var_os("WRAPT_REPO_PATH") {
        candidates.push(PathBuf::from(value));
    }
    if let Ok(current) = std::env::current_dir() {
        candidates.extend(current.ancestors().map(Path::to_path_buf));
    }
    let manifest_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    candidates.push(manifest_root);
    candidates
        .into_iter()
        .find(|path| is_wrapt_repository(path))
        .unwrap_or_default()
}

pub fn is_wrapt_repository(path: &Path) -> bool {
    path.join("package.json").is_file()
        && path.join("apps/server/package.json").is_file()
        && path.join("scripts/restart-backend.sh").is_file()
}

pub fn save_repository(data: &mut LauncherData, repository: PathBuf) -> Result<(), String> {
    if !is_wrapt_repository(&repository) {
        return Err("Der Ordner enthält kein gültiges Wrapt-Repository.".into());
    }
    if data.child.is_some() {
        return Err("Stoppe den verwalteten Server, bevor du den Repository-Pfad änderst.".into());
    }
    let config = SavedConfig {
        repository: repository.to_string_lossy().into_owned(),
    };
    let bytes = serde_json::to_vec_pretty(&config).map_err(|error| error.to_string())?;
    let temporary = data.config_file.with_extension("json.tmp");
    std::fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, &data.config_file).map_err(|error| error.to_string())?;
    data.repository = repository;
    data.last_error = None;
    Ok(())
}
