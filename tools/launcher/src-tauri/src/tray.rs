use crate::app_state::AppState;
use crate::commands;
use crate::health::fetch_health;
use crate::server_manager;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, AppHandle, Manager, Wry};
use tauri_plugin_autostart::ManagerExt;

pub struct TrayItems {
    status: MenuItem<Wry>,
    start: MenuItem<Wry>,
    stop: MenuItem<Wry>,
    restart: MenuItem<Wry>,
    autostart: CheckMenuItem<Wry>,
}

pub fn install(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let status = MenuItem::with_id(app, "status", "Status: wird geprüft", false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Oberfläche öffnen", true, None::<&str>)?;
    let start = MenuItem::with_id(app, "start", "Server starten", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Server stoppen", false, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "Server neu starten", true, None::<&str>)?;
    let logs = MenuItem::with_id(app, "logs", "Serverlogs öffnen", true, None::<&str>)?;
    let enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "Launcher und Server beim Login starten",
        true,
        enabled,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Beenden", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &status, &open, &separator, &start, &stop, &restart, &logs, &autostart, &quit,
        ],
    )?;

    app.manage(TrayItems {
        status,
        start,
        stop,
        restart,
        autostart,
    });
    TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .cloned()
                .expect("Launcher-Icon fehlt"),
        )
        .tooltip("Wrapt Launcher")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(handle_menu_event)
        .build(app)?;
    Ok(())
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "open" => record_result(
            app,
            commands::open_workbench().map(|_| "Oberfläche geöffnet.".to_string()),
        ),
        "start" => {
            let state = app.state::<AppState>();
            record_result(app, server_manager::start_server(&state));
        }
        "stop" => {
            let state = app.state::<AppState>();
            record_result(app, server_manager::stop_server(&state));
        }
        "restart" => {
            let state = app.state::<AppState>();
            record_result(app, server_manager::restart_server(&state));
        }
        "logs" => {
            let state = app.state::<AppState>();
            record_result(
                app,
                commands::open_logs(state).map(|_| "Serverlogs geöffnet.".to_string()),
            );
        }
        "autostart" => toggle_autostart(app),
        "quit" => {
            let state = app.state::<AppState>();
            let _ = server_manager::stop_server(&state);
            app.exit(0);
        }
        _ => {}
    }
}

pub fn refresh(app: &AppHandle) {
    let health = fetch_health();
    let state = app.state::<AppState>();
    let managed = {
        let data = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        data.child.is_some()
    };
    let items = app.state::<TrayItems>();
    let label = if let Some(health) = health.as_ref() {
        format!("Status: erreichbar · v{}", health.version)
    } else if managed {
        "Status: Server startet …".into()
    } else {
        "Status: nicht erreichbar".into()
    };
    let _ = items.status.set_text(label);
    let _ = items.start.set_enabled(health.is_none() && !managed);
    let _ = items.stop.set_enabled(managed);
    let _ = items.restart.set_enabled(managed || health.is_none());
    if let Ok(enabled) = app.autolaunch().is_enabled() {
        let _ = items.autostart.set_checked(enabled);
    }
}

fn toggle_autostart(app: &AppHandle) {
    let result = app
        .autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
        .and_then(|enabled| {
            if enabled {
                app.autolaunch().disable()
            } else {
                app.autolaunch().enable()
            }
            .map_err(|error| error.to_string())
        });
    record_result(
        app,
        result.map(|_| "Autostart-Einstellung geändert.".to_string()),
    );
}

fn record_result(app: &AppHandle, result: Result<String, String>) {
    if let Err(message) = result {
        let state = app.state::<AppState>();
        state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .last_error = Some(message);
    }
}
