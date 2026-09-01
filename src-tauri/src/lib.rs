use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{NewWindowResponse, WebviewWindowBuilder},
    Manager, WebviewUrl, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";
const MAIN_WINDOW_URL: &str = "https://chatgpt.com";
static NEXT_POPUP_ID: AtomicU64 = AtomicU64::new(1);

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
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            WebviewWindowBuilder::new(
                app,
                MAIN_WINDOW_LABEL,
                WebviewUrl::External(MAIN_WINDOW_URL.parse().expect("invalid main window URL")),
            )
            .title("GPTWrap")
            .inner_size(1280.0, 900.0)
            .min_inner_size(800.0, 600.0)
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
