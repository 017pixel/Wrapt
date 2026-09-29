use crate::app_state::{AppState, LauncherData};
use crate::health::{ensure_log_directory, fetch_health, log_file, server_port_is_open};
use std::ffi::OsString;
use std::fs::{File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const TERMINATION_GRACE_PERIOD: Duration = Duration::from_secs(8);

pub fn start_server(state: &AppState) -> Result<String, String> {
    let health = fetch_health();
    let mut data = lock(state);
    if child_is_running(&mut data) {
        data.desired = true;
        return Ok("Der verwaltete Wrapt-Server läuft bereits.".into());
    }
    if health.is_some() {
        return Ok("Wrapt antwortet bereits; ein zweiter Server wurde nicht gestartet.".into());
    }
    if server_port_is_open() {
        return Err(
            "Port 3010 ist belegt, antwortet aber nicht mit Wrapt-Health. Doppelstart abgebrochen."
                .into(),
        );
    }
    data.early_exits = 0;
    launch(&mut data)?;
    data.desired = true;
    data.last_error = None;
    Ok("Wrapt wird gestartet.".into())
}

pub fn stop_server(state: &AppState) -> Result<String, String> {
    let mut data = lock(state);
    if data.child.is_none() {
        return Err("Der Server wird nicht von diesem Launcher verwaltet.".into());
    }
    data.desired = false;
    data.last_error = None;
    terminate(&mut data)?;
    Ok("Stop angefordert. Der Launcher startet den Server nicht erneut.".into())
}

pub fn restart_server(state: &AppState) -> Result<String, String> {
    let health = fetch_health();
    let mut data = lock(state);
    if data.child.is_some() {
        data.desired = true;
        data.last_error = None;
        terminate(&mut data)?;
        return Ok("Neustart angefordert. Der Launcher startet Wrapt erneut.".into());
    }
    if health.is_some() {
        return Err("Der laufende Server gehört nicht zu diesem Launcher und kann hier nicht neu gestartet werden.".into());
    }
    if server_port_is_open() {
        return Err(
            "Port 3010 ist belegt, antwortet aber nicht mit Wrapt-Health. Neustart abgebrochen."
                .into(),
        );
    }
    data.early_exits = 0;
    launch(&mut data)?;
    data.desired = true;
    data.last_error = None;
    Ok("Wrapt war beendet und wird gestartet.".into())
}

pub fn start_monitor(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(500));
        let state = app.state::<AppState>();
        monitor_once(&state);
        crate::tray::refresh(&app);
    });
}

fn monitor_once(state: &AppState) {
    let mut data = lock(state);
    let exited = match data.child.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(Some(status)) => Some(format!("Der Server wurde beendet ({status}).")),
            Err(error) => Some(format!(
                "Der Serverprozess konnte nicht geprüft werden: {error}"
            )),
            Ok(None) => {
                if data
                    .termination_deadline
                    .is_some_and(|deadline| Instant::now() >= deadline)
                {
                    let kill_result = data
                        .child
                        .as_mut()
                        .expect("Kindprozess wurde geprüft")
                        .kill();
                    data.termination_deadline = None;
                    if let Err(error) = kill_result {
                        data.last_error = Some(format!(
                            "Der Server reagiert nicht auf SIGTERM und konnte nicht beendet werden: {error}"
                        ));
                    }
                }
                None
            }
        },
        None => return,
    };
    if let Some(message) = exited {
        let ran_briefly = data
            .last_launch
            .take()
            .is_some_and(|started| started.elapsed() < Duration::from_secs(5));
        data.child = None;
        data.termination_deadline = None;
        data.last_error = Some(message);
        if data.desired {
            if fetch_health().is_some() {
                data.desired = false;
                data.last_error = Some(
                    "Wrapt antwortet über einen fremden Prozess; automatischer Start ausgesetzt."
                        .into(),
                );
                return;
            }
            if server_port_is_open() {
                data.desired = false;
                data.last_error = Some("Port 3010 wurde von einem anderen Prozess belegt; automatischer Start ausgesetzt.".into());
                return;
            }
            if ran_briefly {
                data.early_exits = data.early_exits.saturating_add(1);
            } else {
                data.early_exits = 0;
            }
            if data.early_exits >= 3 {
                data.desired = false;
                data.last_error = Some(
                    "Wrapt beendet sich direkt nach dem Start wieder. Prüfe die Serverlogs.".into(),
                );
                return;
            }
            match launch(&mut data) {
                Ok(()) => data.last_error = None,
                Err(error) => {
                    data.last_error = Some(error);
                    data.desired = false;
                }
            }
        }
    }
}

fn child_is_running(data: &mut LauncherData) -> bool {
    let Some(child) = data.child.as_mut() else {
        return false;
    };
    match child.try_wait() {
        Ok(None) => true,
        Ok(Some(_)) | Err(_) => {
            data.child = None;
            false
        }
    }
}

fn launch(data: &mut LauncherData) -> Result<(), String> {
    if !data.repository.join("apps/server/dist/index.js").is_file() {
        return Err(
            "Der Server-Build fehlt. Führe im Wrapt-Repository zuerst `pnpm build` aus.".into(),
        );
    }
    let node =
        find_node().ok_or_else(|| "Node.js 22 oder neuer wurde nicht gefunden.".to_string())?;
    let log = log_file(&data.repository);
    ensure_log_directory(&data.repository)?;
    let output = open_log(&log)
        .map_err(|error| format!("Serverlog konnte nicht geöffnet werden: {error}"))?;
    let errors = output
        .try_clone()
        .map_err(|error| format!("Serverlog konnte nicht dupliziert werden: {error}"))?;
    let mut command = Command::new(&node);
    command
        .arg("apps/server/dist/index.js")
        .current_dir(&data.repository)
        .env("NODE_ENV", "production")
        .env("WRAPT_MANAGED_BY", "launcher")
        .env_remove("WRAPT_DEV_WATCH")
        .env_remove("WRAPT_DEV_TAILSCALE_USER")
        .env("PATH", child_path(&node))
        .stdin(Stdio::null())
        .stdout(Stdio::from(output))
        .stderr(Stdio::from(errors));
    let child = command
        .spawn()
        .map_err(|error| format!("Wrapt konnte nicht gestartet werden: {error}"))?;
    data.child = Some(child);
    data.last_launch = Some(std::time::Instant::now());
    data.termination_deadline = None;
    Ok(())
}

fn open_log(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}

fn terminate(data: &mut LauncherData) -> Result<(), String> {
    let child = data
        .child
        .as_mut()
        .ok_or_else(|| "Der Server wird nicht von diesem Launcher verwaltet.".to_string())?;
    #[cfg(unix)]
    {
        let result = unsafe { libc::kill(child.id() as libc::pid_t, libc::SIGTERM) };
        if result != 0 {
            return Err(format!(
                "SIGTERM konnte nicht gesendet werden: {}",
                io::Error::last_os_error()
            ));
        }
    }
    #[cfg(windows)]
    child
        .kill()
        .map_err(|error| format!("Der Serverprozess konnte nicht beendet werden: {error}"))?;
    #[cfg(unix)]
    {
        data.termination_deadline = Some(Instant::now() + TERMINATION_GRACE_PERIOD);
    }
    Ok(())
}

fn find_node() -> Option<PathBuf> {
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    let mut candidates = std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
        .map(|directory| directory.join(name))
        .collect::<Vec<_>>();
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        let home = PathBuf::from(home);
        candidates.extend([
            home.join(".volta/bin").join(name),
            home.join(".local/share/mise/shims").join(name),
            home.join(".nvm/versions/node"),
        ]);
        let nvm = home.join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(nvm) {
            let mut node_versions = entries
                .flatten()
                .map(|entry| entry.path().join("bin").join(name))
                .collect::<Vec<_>>();
            node_versions.sort();
            node_versions.reverse();
            candidates.extend(node_versions);
        }
    }
    #[cfg(target_os = "macos")]
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/local/bin/node"),
    ]);
    #[cfg(windows)]
    if let Some(program_files) = std::env::var_os("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("nodejs/node.exe"));
    }
    candidates
        .into_iter()
        .find(|path| path.is_file() && supports_node_22(path))
}

fn supports_node_22(path: &Path) -> bool {
    let Ok(output) = Command::new(path).arg("--version").output() else {
        return false;
    };
    let version = String::from_utf8_lossy(&output.stdout);
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .next()
        .and_then(|major| major.parse::<u32>().ok())
        .is_some_and(|major| major >= 22)
}

fn child_path(node: &Path) -> OsString {
    let mut directories =
        std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).collect::<Vec<_>>();
    if let Some(parent) = node.parent() {
        directories.push(parent.to_path_buf());
    }
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        let home = PathBuf::from(home);
        directories.extend([
            home.join(".local/bin"),
            home.join(".npm-global/bin"),
            home.join(".local/share/pnpm"),
            home.join(".cargo/bin"),
            home.join(".volta/bin"),
        ]);
    }
    #[cfg(target_os = "macos")]
    directories.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    #[cfg(windows)]
    if let Some(app_data) = std::env::var_os("APPDATA") {
        directories.push(PathBuf::from(app_data).join("npm"));
    }
    #[cfg(windows)]
    for install_root in [
        std::env::var_os("ProgramFiles"),
        std::env::var_os("ProgramW6432"),
        std::env::var_os("ProgramFiles(x86)"),
    ]
    .into_iter()
    .flatten()
    {
        let git = PathBuf::from(install_root).join("Git");
        directories.extend([git.join("bin"), git.join("usr/bin")]);
    }
    #[cfg(windows)]
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        let git = PathBuf::from(local_app_data).join("Programs/Git");
        directories.extend([git.join("bin"), git.join("usr/bin")]);
    }
    let mut unique = Vec::new();
    for directory in directories {
        if !unique.iter().any(|existing| existing == &directory) {
            unique.push(directory);
        }
    }
    std::env::join_paths(unique).unwrap_or_default()
}

fn lock(state: &AppState) -> std::sync::MutexGuard<'_, LauncherData> {
    state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
