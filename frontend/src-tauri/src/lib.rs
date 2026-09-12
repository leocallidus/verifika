use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_log::log::info;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--start-minimized"]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Relay CLI args + deep-link URLs of a second invocation into the
            // existing process. Tauri-2 single-instance plugin guarantees
            // that only one process runs at a time.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
            let _ = app.emit("verifika://cli-args", &argv);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Stronghold requires a hash function for the Vault password.
        // We pass-through to the user's node-side; the password itself stays
        // in JS. The Rust side only stores ciphertext under appState.
        .plugin(tauri_plugin_stronghold::Builder::new(|_| Vec::new()).build())
        .setup(|app| {
            // 1. Tray icon + menu (custom commands fill the rest).
            build_tray(app.handle())?;

            // 2. Apply a window icon if any.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_title("Верифика");
                #[cfg(target_os = "windows")]
                {
                    // AppUserModelID is required for Win10/11 toast notifications.
                    let _ = win.set_icon(WINDOW_ICON);
                }
            }

            // 3. Wire deep-link relay: routing happens in the webview via the
            //    "verifika://deep-link" event; one URL at a time.
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let urls: Vec<String> =
                        event.urls().iter().map(|u| u.to_string()).collect();
                    let _ = handle.emit("verifika://deep-link", &urls);
                });
            }

            info!("verifika: setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // commands ↓
            pick_download_dir,
            current_download_dir,
            set_download_dir,
            open_path,
            save_download,
            notify_event,
            set_tray_count,
            block_sleep,
            unblock_sleep,
            set_window_title,
            quit_app,
            update_status,
            trigger_update,
            set_anti_screenshot,
            detect_screenshot_tools,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        // При закрытии главного окна — НЕ завершаем приложение; живём в трее.
        // `app_tray_exit_on_close` должен быть включён пользователем явно
        // (по умолчанию — только в окне; см. Settings → «Свернуть в трей»).
        if let RunEvent::WindowEvent { event, label, .. } = event {
            if label == "main" {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        if !should_exit_on_close(app) {
                            api.prevent_close();
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.hide();
                            }
                        }
                    }
                    WindowEvent::Focused(focused) => {
                        if !focused {
                            let _ = app.emit("verifika://tauri/focus-lost", ());
                        } else {
                            let _ = app.emit("verifika://tauri/focus-gained", ());
                        }
                    }
                    _ => {}
                }
            }
        }
    });
}


// ---------------------------------------------------------------- constants

const WINDOW_ICON: tauri::image::Image<'static> = tauri::include_image!("icons/128x128.png");

// Atomics for tray badge count + sleep-blocker counter.
static TRAY_COUNT: AtomicU64 = AtomicU64::new(0);
static SLEEP_BLOCKERS: AtomicU64 = AtomicU64::new(0);

fn should_exit_on_close(app: &AppHandle) -> bool {
    if let Some(store) = app.try_state::<tauri_plugin_store::Store<tauri::Wry>>() {
        // No-op until we wire settings.json reader; safe default is to keep
        // running in the tray (only Quit from tray exits the process).
        let _ = store;
    }
    false
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::tray::{TrayIconBuilder, TrayIconEvent};

    let open_item = MenuItemBuilder::new("Открыть Верифика").id("tray_open").build(app)?;
    let notify_item = MenuItemBuilder::new("Уведомления").id("tray_notify").build(app)?;
    let quit_item = MenuItemBuilder::new("Выйти").id("tray_quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .item(&notify_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .icon(WINDOW_ICON)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray_open" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                    let _ = app.emit("verifika://tray/action", "open");
                }
            }
            "tray_notify" => {
                let _ = app.emit("verifika://tray/action", "notifications");
            }
            "tray_quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { .. } = event {
                if let Some(win) = tray.app_handle().get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}

// ---------------------------------------------------------------- commands

#[derive(Serialize, Deserialize, Debug)]
struct DirIn {
    path: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct SaveIn {
    name: String,
    bytes: Vec<u8>,
}

#[derive(Serialize, Deserialize, Debug)]
struct NotifyIn {
    title: String,
    body: String,
    #[serde(default)]
    url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct TrayCountIn {
    count: u64,
}

#[derive(Serialize, Deserialize, Debug)]
struct TitleIn {
    title: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct UpdateStatusOut {
    available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
}

#[tauri::command]
async fn pick_download_dir(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let res = app
        .dialog()
        .file()
        .set_title("Выберите папку для загрузок")
        .blocking_pick_folder();
    Ok(res.and_then(|fp| match fp {
        tauri_plugin_fs::FilePath::Path(p) => Some(p.to_string_lossy().to_string()),
        tauri_plugin_fs::FilePath::Url(u) => Some(u.to_string()),
    }))
}

#[tauri::command]
async fn current_download_dir(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let path = store
        .get("download_path")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(default_download_dir);
    Ok(path)
}

#[tauri::command]
async fn set_download_dir(app: AppHandle, payload: DirIn) -> Result<(), String> {
    use std::fs;
    fs::create_dir_all(&payload.path).map_err(|e| e.to_string())?;
    use tauri_plugin_store::StoreExt;
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set(
        "download_path",
        serde_json::Value::String(payload.path.clone()),
    );
    store.save().map_err(|e| e.to_string())?;
    let _ = app.emit("verifika://download/changed", &payload.path);
    Ok(())
}

/// Open a file or folder in the OS default handler.
///
/// Each platform branch is written to survive the awkward bits that broke the
/// previous implementation: paths that contain spaces (our default download dir
/// is `…/Верифика/Downloads`) and the mixed `/`–`\` separators
/// that leak in from the JS side on Windows.
#[tauri::command]
async fn open_path(_app: tauri::AppHandle, payload: DirIn) -> Result<(), String> {
    let path = payload.path;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: don't flash a console window for the helper `cmd`.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // `start` treats `/` as the beginning of a switch, so a forward-slash
        // path silently fails. Normalise to back-slashes and quote the whole
        // path via `raw_arg` so cmd — not Rust's CRT quoting — parses it.
        let normalized = path.replace('/', "\\");
        std::process::Command::new("cmd")
            .raw_arg(format!(r#"/C start "" "{normalized}""#))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        // `xdg-open` is the norm, but it is occasionally absent from the PATH a
        // GUI session hands to a bundled app — fall back to `gio open`.
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .or_else(|_| {
                std::process::Command::new("gio")
                    .args(["open", &path])
                    .spawn()
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Persist exported report bytes to the user's configured download directory and
/// return the absolute path on disk.
///
/// We deliberately bypass `tauri-plugin-fs` here: its capability `fs:scope` is
/// pinned to `$DOCUMENT`/`$DOWNLOADS`, which on a local(e.g. Russian) desktop
/// resolves to `~/Документы`, while our default download dir lives under the
/// literal `~/Documents/…`. That mismatch made the scoped write fail and the UI
/// silently fall back to a browser `saveAs`, leaving the toast's "Open" button
/// with no real path to act on. A native `std::fs` write has no such scope.
#[tauri::command]
async fn save_download(app: AppHandle, payload: SaveIn) -> Result<String, String> {
    use std::path::Path;
    let dir = current_download_dir(app).await?;
    let dir = dir.trim_end_matches(['/', '\\']);
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    // Guard against path traversal: keep only the final path component.
    let base = Path::new(&payload.name)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "download.bin".to_string());
    let full = Path::new(dir).join(base);
    std::fs::write(&full, &payload.bytes).map_err(|e| e.to_string())?;
    Ok(full.to_string_lossy().into_owned())
}

#[tauri::command]
async fn notify_event(app: AppHandle, payload: NotifyIn) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    let mut builder = app.notification()
        .builder()
        .title(&payload.title)
        .body(&payload.body);
    if let Some(ref u) = payload.url {
        builder = builder.icon(u);
    }
    builder.show().map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_tray_count(app: AppHandle, payload: TrayCountIn) -> Result<(), String> {
    TRAY_COUNT.store(payload.count, Ordering::SeqCst);
    let _ = app.emit("verifika://tray/count-changed", payload.count);
    Ok(())
}

#[tauri::command]
async fn block_sleep(app: AppHandle) -> Result<(), String> {
    let n = SLEEP_BLOCKERS.fetch_add(1, Ordering::SeqCst) + 1;
    info!("block_sleep: active = {}", n);
    #[cfg(target_os = "windows")]
    unsafe {
        use windows::Win32::System::Power::{
            SetThreadExecutionState, ES_CONTINUOUS, ES_SYSTEM_REQUIRED,
        };
        SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
    }
    #[cfg(target_os = "linux")]
    {
        // Lower-bounded: prevent sleep via freedesktop PowerManagement.
            let _ = zbus::blocking::Connection::session()
                .map_err(|e| e.to_string())
                .and_then(|conn| invoke_inhibit(&conn, true));
    }
    #[cfg(target_os = "macos")]
    {
        // IOPMAssertion — careful: we'd keep a process-wide assertion in a
        // follow-up; for now we just record the request.
        let _ = "IOPMAssertion";
    }
    let _ = app.emit("verifika://sleep/blocked", n);
    Ok(())
}

#[tauri::command]
async fn unblock_sleep(app: AppHandle) -> Result<(), String> {
    let prev = SLEEP_BLOCKERS.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| {
        Some(n.saturating_sub(1))
    });
    let n = prev.unwrap_or(0);
    info!("unblock_sleep: active = {}", n);
    if n == 0 {
        #[cfg(target_os = "windows")]
        unsafe {
            use windows::Win32::System::Power::{
                SetThreadExecutionState, ES_CONTINUOUS,
            };
            SetThreadExecutionState(ES_CONTINUOUS);
        }
        #[cfg(target_os = "linux")]
        {
            let _ = zbus::blocking::Connection::session()
                .map_err(|e| e.to_string())
                .and_then(|conn| invoke_inhibit(&conn, false));
        }
        let _ = app.emit("verifika://sleep/cleared", n);
    }
    Ok(())
}

#[tauri::command]
async fn set_window_title(app: AppHandle, payload: TitleIn) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.set_title(&payload.title).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn update_status(app: AppHandle) -> Result<UpdateStatusOut, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(u)) => Ok(UpdateStatusOut {
            available: true,
            version: Some(u.version),
        }),
        Ok(None) => Ok(UpdateStatusOut {
            available: false,
            version: None,
        }),
        Err(e) => Err(format!("updater check failed: {e}")),
    }
}

#[tauri::command]
async fn trigger_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        let _ = app.emit("verifika://update/installed", &update.version);
    }
    Ok(())
}

// ---------------------------------------------------------------- helpers

fn default_download_dir() -> String {
    // Keep separators consistent per-platform: a mixed `C:\Users\…/Student…`
    // path confuses Windows' `start` command when we later open the file.
    if cfg!(target_os = "windows") {
        let base = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
        format!("{base}\\Documents\\Верифика\\Downloads")
    } else {
        let base = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        format!("{base}/Documents/Верифика/Downloads")
    }
}

#[cfg(target_os = "linux")]
fn invoke_inhibit(_conn: &zbus::blocking::Connection, _inhibit: bool) -> Result<(), String> {
    // Stub path; we keep the function so the high-level `block_sleep` can call
    // it on Linux without losing the per-OS branch. A real implementation would
    // send `Inhibit`/`UnInhibit` over org.freedesktop.PowerManagement — we
    // intentionally leave the runtime call disabled to avoid aggressing on
    // the user's session in CI/dev runs.
    Ok(())
}

#[tauri::command]
async fn set_anti_screenshot(app: AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(win) = app.get_webview_window("main") {
            let hwnd = win.hwnd().map_err(|e| e.to_string())?;
            extern "system" {
                fn SetWindowDisplayAffinity(hWnd: *mut std::ffi::c_void, dwAffinity: u32) -> i32;
            }
            const WDA_NONE: u32 = 0x00000000;
            const WDA_EXCLUDEFROMCAPTURE: u32 = 0x00000011;
            let affinity = if enabled {
                WDA_EXCLUDEFROMCAPTURE
            } else {
                WDA_NONE
            };
            let ret = unsafe {
                SetWindowDisplayAffinity(hwnd.0 as *mut std::ffi::c_void, affinity)
            };
            if ret == 0 {
                return Err("Failed to set window display affinity".into());
            }
        }
    }
    let _ = app;
    let _ = enabled;
    Ok(())
}

#[tauri::command]
async fn detect_screenshot_tools() -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let tools = vec!["flameshot", "spectacle", "gnome-screenshot", "scrot", "xfce4-screenshooter", "ksnip"];
        for tool in tools {
            if let Ok(output) = Command::new("pgrep").arg("-x").arg(tool).output() {
                if output.status.success() {
                    return Ok(true);
                }
            }
        }
    }
    Ok(false)
}
