use std::{fmt::Display, sync::Mutex, time::Duration};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, State};
use tauri_plugin_updater::UpdaterExt;

pub const DOWNLOAD_STARTED_EVENT: &str = "gptwrap://update-download-started";
pub const DOWNLOAD_PROGRESS_EVENT: &str = "gptwrap://update-download-progress";
pub const DOWNLOAD_FINISHED_EVENT: &str = "gptwrap://update-download-finished";
pub const INSTALLING_EVENT: &str = "gptwrap://update-installing";

#[derive(Default)]
pub struct UpdateState(Mutex<UpdateSession>);

#[derive(Default)]
struct UpdateSession {
    pending: Option<tauri_plugin_updater::Update>,
    checking: bool,
    installing: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub version: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadStarted {
    content_length: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    downloaded: u64,
    content_length: Option<u64>,
}

fn lock_error() -> String {
    "更新状态暂时不可用，请重启应用后重试".to_owned()
}

fn update_error(error: impl Display) -> String {
    let detail = error.to_string();
    let lower = detail.to_ascii_lowercase();
    if lower.contains("signature")
        || lower.contains("signature verification")
        || lower.contains("public key")
    {
        format!("更新包验证失败：{detail}")
    } else {
        format!("更新失败：{detail}")
    }
}

fn emit_update_event<R, S>(app: &AppHandle<R>, event: &str, payload: S)
where
    R: Runtime,
    S: Serialize + Clone,
{
    if let Err(error) = app.emit_to("about", event, payload) {
        eprintln!("failed to emit updater event {event}: {error}");
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn check_for_update<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, UpdateState>,
) -> Result<Option<UpdateInfo>, String> {
    {
        let mut session = state.0.lock().map_err(|_| lock_error())?;
        if session.checking || session.installing {
            return Err("更新操作正在进行中，请稍候".to_owned());
        }
        session.pending = None;
        session.checking = true;
    }

    let result = async {
        let update = app
            .updater_builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(update_error)?
            .check()
            .await
            .map_err(update_error)?;

        let info = update.as_ref().map(|update| UpdateInfo {
            current_version: update.current_version.clone(),
            version: update.version.clone(),
        });

        let mut session = state.0.lock().map_err(|_| lock_error())?;
        session.pending = update;
        Ok(info)
    }
    .await;

    if let Ok(mut session) = state.0.lock() {
        session.checking = false;
    }

    result
}

#[tauri::command(rename_all = "camelCase")]
pub async fn install_update<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, UpdateState>,
) -> Result<(), String> {
    let update = {
        let mut session = state.0.lock().map_err(|_| lock_error())?;
        if session.checking || session.installing {
            return Err("更新操作正在进行中，请稍候".to_owned());
        }

        let Some(update) = session.pending.take() else {
            return Err("没有可安装的更新，请先检查更新".to_owned());
        };

        session.installing = true;
        update
    };

    let event_app = app.clone();
    let result = async {
        let mut first_chunk = true;
        let mut downloaded = 0_u64;
        let event_app_for_chunks = event_app.clone();
        let event_app_for_finished = event_app.clone();

        let bytes = update
            .download(
                move |chunk_length, content_length| {
                    if first_chunk {
                        first_chunk = false;
                        emit_update_event(
                            &event_app_for_chunks,
                            DOWNLOAD_STARTED_EVENT,
                            DownloadStarted { content_length },
                        );
                    }

                    downloaded = downloaded.saturating_add(chunk_length as u64);
                    emit_update_event(
                        &event_app_for_chunks,
                        DOWNLOAD_PROGRESS_EVENT,
                        DownloadProgress {
                            downloaded,
                            content_length,
                        },
                    );
                },
                move || {
                    emit_update_event(&event_app_for_finished, DOWNLOAD_FINISHED_EVENT, ());
                },
            )
            .await
            .map_err(update_error)?;

        emit_update_event(&app, INSTALLING_EVENT, ());
        update.install(bytes).map_err(update_error)?;

        Ok(())
    }
    .await;

    if let Ok(mut session) = state.0.lock() {
        session.installing = false;
        if result.is_err() {
            session.pending = Some(update);
        } else {
            session.pending = None;
        }
    }

    #[cfg(not(windows))]
    if result.is_ok() {
        app.restart();
    }

    result
}

#[cfg(test)]
mod tests {
    use super::UpdateInfo;

    #[test]
    fn update_info_uses_frontend_field_names() {
        let value = serde_json::to_value(UpdateInfo {
            current_version: "0.1.5".to_owned(),
            version: "0.1.6".to_owned(),
        })
        .expect("update metadata should serialize");

        assert_eq!(value["currentVersion"], "0.1.5");
        assert_eq!(value["version"], "0.1.6");
    }
}
