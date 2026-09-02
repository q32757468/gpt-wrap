use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{DownloadEvent, NewWindowResponse, Webview, WebviewWindowBuilder},
    Manager, WebviewUrl, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

mod about_window;
mod injected_titlebar;

const MAIN_WINDOW_LABEL: &str = "main";
const MAIN_WINDOW_URL: &str = "https://chatgpt.com";
const ABOUT_WINDOW_LABEL: &str = "about";
const ABOUT_WINDOW_WIDTH: f64 = 360.0;
const ABOUT_WINDOW_HEIGHT: f64 = 292.0;
static NEXT_POPUP_ID: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
async fn open_about_window<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(ABOUT_WINDOW_LABEL) {
        window
            .unminimize()
            .map_err(|error| format!("failed to restore the about window: {error}"))?;
        window
            .show()
            .map_err(|error| format!("failed to show the about window: {error}"))?;
        window
            .set_focus()
            .map_err(|error| format!("failed to focus the about window: {error}"))?;
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(
        &app,
        ABOUT_WINDOW_LABEL,
        WebviewUrl::App("about.html".into()),
    )
    .title("关于 GPTWrap")
    // Keep the native window's content area the same size as the former
    // in-page about dialog.
    .inner_size(ABOUT_WINDOW_WIDTH, ABOUT_WINDOW_HEIGHT)
    .min_inner_size(ABOUT_WINDOW_WIDTH, ABOUT_WINDOW_HEIGHT)
    .max_inner_size(ABOUT_WINDOW_WIDTH, ABOUT_WINDOW_HEIGHT)
    .resizable(false)
    .center()
    .initialization_script(about_window::script());

    if let Some(parent) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        builder = builder
            .parent(&parent)
            .map_err(|error| format!("failed to parent the about window: {error}"))?;
    }

    builder
        .build()
        .map(|_| ())
        .map_err(|error| format!("failed to create the about window: {error}"))
}

fn handle_download<R: tauri::Runtime>(webview: Webview<R>, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested {
            url: _,
            destination,
        } => {
            let suggested_file_name = destination
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("download")
                .to_owned();

            let window = webview.window();
            let mut dialog = rfd::FileDialog::new()
                .set_parent(&window)
                .set_title("选择保存位置")
                .set_file_name(suggested_file_name);

            if let Some(directory) = destination.parent() {
                dialog = dialog.set_directory(directory);
            }

            let Some(selected_path) = dialog.save_file() else {
                println!("download cancelled");
                return false;
            };

            *destination = selected_path;
            println!("downloading to {}", destination.display());
        }
        DownloadEvent::Finished {
            url: _,
            path,
            success,
        } => {
            println!(
                "downloaded to {} (success: {success})",
                path.as_deref()
                    .map(|path| path.display().to_string())
                    .unwrap_or_else(|| "<unknown>".to_string())
            );

            let (title, body) = if success {
                let body = path
                    .as_deref()
                    .map(|path| {
                        let file_name = path
                            .file_name()
                            .and_then(|name| name.to_str())
                            .unwrap_or("文件");
                        let directory = path
                            .parent()
                            .map(|directory| directory.display().to_string())
                            .unwrap_or_else(|| "所选位置".to_string());

                        format!("{file_name}\n已保存到 {directory}")
                    })
                    .unwrap_or_else(|| "文件已保存到所选位置".to_string());

                ("下载完成", body)
            } else {
                ("下载失败", "文件未能保存，请重试".to_string())
            };

            if let Err(error) = webview
                .notification()
                .builder()
                .title(title)
                .body(body)
                .show()
            {
                eprintln!("failed to show download notification: {error}");
            }
        }
        _ => {}
    }

    // Returning true accepts the request after the user selects a destination.
    true
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Err(error) = window.unminimize() {
            eprintln!("failed to restore the main window: {error}");
        }

        if let Err(error) = window.show() {
            eprintln!("failed to show the main window: {error}");
        }

        if let Err(error) = window.set_focus() {
            eprintln!("failed to focus the main window: {error}");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![open_about_window])
        .setup(|app| {
            let app_handle = app.handle().clone();
            WebviewWindowBuilder::new(
                app,
                MAIN_WINDOW_LABEL,
                WebviewUrl::External(MAIN_WINDOW_URL.parse().expect("invalid main window URL")),
            )
            .title("GPTWrap")
            .decorations(false)
            .initialization_script(injected_titlebar::script())
            .inner_size(1280.0, 900.0)
            .min_inner_size(800.0, 600.0)
            .on_download(handle_download)
            .on_new_window(move |url, features| {
                let label = format!("popup-{}", NEXT_POPUP_ID.fetch_add(1, Ordering::Relaxed));
                let popup = WebviewWindowBuilder::new(
                    &app_handle,
                    label,
                    WebviewUrl::External("about:blank".parse().expect("invalid blank URL")),
                )
                .window_features(features)
                .center()
                .inner_size(500.0, 700.0)
                .title(url.as_str())
                .on_download(handle_download)
                .on_document_title_changed(|window, title| {
                    if let Err(error) = window.set_title(&title) {
                        eprintln!("failed to set popup title: {error}");
                    }
                })
                .build();

                match popup {
                    Ok(window) => NewWindowResponse::Create { window },
                    Err(error) => {
                        eprintln!("failed to create popup for {url}: {error}");
                        NewWindowResponse::Deny
                    }
                }
            })
            .build()?;
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出应用", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("GPTWrap")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        show_main_window(&app);
                    }
                })
                .icon(app.default_window_icon().unwrap().clone())
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == MAIN_WINDOW_LABEL {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();

                    if let Err(error) = window.hide() {
                        eprintln!("failed to hide the main window: {error}");
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
