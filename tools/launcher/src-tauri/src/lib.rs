mod app_state;
mod commands;
mod health;
mod server_manager;
mod tray;

use app_state::AppState;
use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--start-server".into()]),
        ))
        .setup(|app| {
            let state = AppState::load(&app.handle())?;
            app.manage(state);
            tray::install(app)?;
            if std::env::args().any(|argument| argument == "--start-server") {
                let state = app.state::<AppState>();
                if let Err(error) = server_manager::start_server(&state) {
                    state
                        .inner
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner())
                        .last_error = Some(error);
                }
            }
            server_manager::start_monitor(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::set_repository_path,
            commands::start_server,
            commands::stop_server,
            commands::restart_server,
            commands::open_workbench,
            commands::open_logs,
            commands::get_autostart,
            commands::set_autostart,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("Wrapt Launcher konnte nicht gestartet werden");
}
