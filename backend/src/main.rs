#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod five;
mod history;
mod net;
mod perfect;
mod state;

use serde_json::{json, Value};
use state::AppState;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};

use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

const APP_NAME: &str = "CS 匹配助手";
const APP_VERSION: &str = "4.0.2";
const REPO: &str = "SLEEPHASE/cs-match-helper";

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(AppState::new(&handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ---- 日志 ----
            get_log_status,
            start_log_watch,
            stop_log_watch,
            read_latest_log_lines,
            // ---- 完美 ----
            fetch_perfect_player_stats,
            fetch_perfect_party_evidence,
            resolve_perfect_match_teams,
            debug_perfect_player_apis,
            search_perfect_board_user,
            get_perfect_auth_status,
            start_perfect_qr_login,
            start_perfect_steam_login,
            cancel_perfect_login,
            clear_perfect_auth,
            decrypt_perfect_response,
            // ---- 5E ----
            launch_5e_with_cdp,
            start_5e_cdp_collector,
            stop_5e_cdp_collector,
            get_5e_cdp_status,
            set_5e_cdp_gate_debug_mode,
            set_5e_cdp_ws_debug_mode,
            probe_5e_cdp_active,
            fetch_5e_match_detail,
            fetch_5e_player_home,
            fetch_5e_player_home_batch,
            load_p5e_client_root,
            save_p5e_client_root,
            // ---- 网络 / 窗口 ----
            fetch_http_json,
            fetch_proxied_image,
            open_app_devtools,
            close_app_devtools,
            // ---- AI ----
            get_ai_settings_path,
            load_ai_settings,
            save_ai_settings,
            start_ai_analysis,
            cancel_ai_analysis,
            // ---- 应用 / 更新 ----
            get_app_version,
            check_for_update,
            list_changelog_releases,
            get_changelog_release,
            download_update,
            apply_update_and_restart,
            get_comment_client_key,
            relaunch_as_admin,
            set_app_locale,
            close_app,
            // ---- 历史 ----
            list_match_history,
            list_match_history_documents,
            get_match_history_entry,
            upsert_match_history_entry,
            patch_match_history_section,
            delete_match_history_entry,
            clear_match_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/* ============================ 日志 ============================ */

#[tauri::command]
fn get_log_status(state: State<'_, AppState>) -> Value {
    json!({
        "watching": state.log_watch.load(Ordering::SeqCst),
        "logDir": state.data_dir.to_string_lossy(),
    })
}

#[tauri::command]
async fn read_latest_log_lines(log_dir: Option<String>, lines: Option<usize>) -> Result<Value, String> {
    let dir = log_dir.unwrap_or_else(|| ".".into());
    let take = lines.unwrap_or(200);
    let mut out: Vec<String> = Vec::new();

    let entries = std::fs::read_dir(&dir).map_err(|e| format!("LOG: {e}"))?;
    let mut files: Vec<_> = entries
        .flatten()
        .filter(|e| {
            e.path()
                .extension()
                .map(|x| x.to_string_lossy() == "log")
                .unwrap_or(false)
        })
        .collect();
    files.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());

    if let Some(last) = files.last() {
        let text = std::fs::read_to_string(last.path()).unwrap_or_default();
        out = text.lines().rev().take(take).map(|s| s.to_string()).collect();
        out.reverse();
    }
    Ok(json!({ "lines": out }))
}

#[tauri::command]
async fn start_log_watch(app: AppHandle, log_dir: Option<String>) -> Result<Value, String> {
    let state = app.state::<AppState>();
    if state.log_watch.swap(true, Ordering::SeqCst) {
        return Ok(json!({ "watching": true }));
    }
    let dir = log_dir.unwrap_or_else(|| state.data_dir.to_string_lossy().to_string());
    let app2 = app.clone();

    tauri::async_runtime::spawn(async move {
        let mut last_len = std::fs::metadata(&dir)
            .ok()
            .filter(|m| m.is_file())
            .map(|m| m.len())
            .unwrap_or(0);
        loop {
            let st = app2.state::<AppState>();
            if !st.log_watch.load(Ordering::SeqCst) {
                break;
            }
            if let Ok(meta) = std::fs::metadata(&dir) {
                if meta.is_file() && meta.len() > last_len {
                    if let Ok(bytes) = std::fs::read(&dir) {
                        if (last_len as usize) < bytes.len() {
                            let new_part = String::from_utf8_lossy(&bytes[last_len as usize..]);
                            for line in new_part.lines() {
                                app2.emit("log-line", json!({ "line": line })).ok();
                            }
                        }
                    }
                    last_len = meta.len();
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    });

    Ok(json!({ "watching": true, "logDir": dir }))
}

#[tauri::command]
fn stop_log_watch(state: State<'_, AppState>) -> Value {
    state.log_watch.store(false, Ordering::SeqCst);
    json!({ "watching": false })
}

/* ============================ 完美 ============================ */

#[tauri::command]
async fn fetch_perfect_player_stats(
    state: State<'_, AppState>,
    steam_id: String,
) -> Result<Value, String> {
    let auth = state.auth.lock().map_err(|e| e.to_string())?.clone();
    perfect::player_stats(&state.client, &steam_id, &auth).await
}

#[tauri::command]
async fn fetch_perfect_party_evidence(
    _state: State<'_, AppState>,
    steam_ids: Vec<String>,
    cutoff_at: Option<i64>,
) -> Result<Value, String> {
    Ok(json!({
        "steamIds": steam_ids,
        "cutoffAt": cutoff_at,
        "evidence": [],
        "partial": true
    }))
}

#[tauri::command]
async fn resolve_perfect_match_teams(
    _state: State<'_, AppState>,
    expected_match_id: Option<String>,
    expected_player_ids: Vec<String>,
) -> Result<Value, String> {
    Ok(json!({
        "matchId": expected_match_id,
        "playerIds": expected_player_ids,
        "teams": [],
        "source": "rebuilt",
        "partial": true
    }))
}

#[tauri::command]
async fn debug_perfect_player_apis(
    state: State<'_, AppState>,
    steam_id: Option<String>,
) -> Result<Value, String> {
    let auth = state.auth.lock().map_err(|e| e.to_string())?.clone();
    let authed = auth.is_some();
    Ok(json!({ "steamId": steam_id, "authenticated": authed }))
}

#[tauri::command]
async fn search_perfect_board_user(
    _state: State<'_, AppState>,
    steam_id: String,
) -> Result<Value, String> {
    Ok(json!({ "steamId": steam_id, "items": [] }))
}

#[tauri::command]
fn get_perfect_auth_status(state: State<'_, AppState>) -> Value {
    let auth = state.auth.lock().map(|a| a.clone()).unwrap_or(None);
    match auth {
        Some(a) => json!({
            "authenticated": true,
            "steamId": a.get("steamId").cloned().unwrap_or(Value::Null),
            "nickname": a.get("nickname").cloned().unwrap_or(Value::Null),
            "loginMethod": a.get("loginMethod").cloned().unwrap_or(Value::Null),
        }),
        None => json!({ "authenticated": false }),
    }
}

#[tauri::command]
async fn start_perfect_qr_login(state: State<'_, AppState>) -> Result<Value, String> {
    let _ = state;
    Err("PERFECT_QR_UNSUPPORTED: 重建版未实现扫码登录，请把 origin 版 auth.json 里的 accessToken/steamId 复制到本程序数据目录".into())
}

#[tauri::command]
async fn start_perfect_steam_login(state: State<'_, AppState>) -> Result<Value, String> {
    let _ = state;
    Err("PERFECT_STEAM_UNSUPPORTED: 重建版未实现 Steam 网页登录".into())
}

#[tauri::command]
fn cancel_perfect_login() -> Value {
    json!({ "cancelled": true })
}

#[tauri::command]
fn clear_perfect_auth(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    *state.auth.lock().map_err(|e| e.to_string())? = None;
    state.persist_auth()?;
    app.emit("perfect-auth-state", json!({ "authenticated": false })).ok();
    Ok(json!({ "authenticated": false }))
}

#[tauri::command]
fn decrypt_perfect_response(input: Value) -> Result<Value, String> {
    // 原版解的是接口返回的加密信封；重建版直连明文接口，这里原样返回
    Ok(input)
}

/* ============================ 5E ============================ */

#[tauri::command]
async fn launch_5e_with_cdp(_port: Option<u16>, _client_root: Option<String>) -> Result<Value, String> {
    Err(five::disabled("launch_5e_with_cdp"))
}

#[tauri::command]
async fn start_5e_cdp_collector(_port: Option<u16>, _client_root: Option<String>) -> Result<Value, String> {
    Err(five::disabled("start_5e_cdp_collector"))
}

#[tauri::command]
fn stop_5e_cdp_collector() -> Value {
    json!({ "stopped": true })
}

#[tauri::command]
fn get_5e_cdp_status() -> Value {
    five::status()
}

#[tauri::command]
fn set_5e_cdp_gate_debug_mode(_enabled: bool) -> Value {
    json!({ "enabled": false })
}

#[tauri::command]
fn set_5e_cdp_ws_debug_mode(_enabled: bool) -> Value {
    json!({ "enabled": false })
}

#[tauri::command]
async fn probe_5e_cdp_active(_client_root: Option<String>) -> Result<Value, String> {
    Ok(json!({ "active": false }))
}

#[tauri::command]
async fn fetch_5e_match_detail(_match_code: String) -> Result<Value, String> {
    Err(five::disabled("fetch_5e_match_detail"))
}

#[tauri::command]
async fn fetch_5e_player_home(_uuid: String) -> Result<Value, String> {
    Err(five::disabled("fetch_5e_player_home"))
}

#[tauri::command]
async fn fetch_5e_player_home_batch(_uuids: Vec<String>) -> Result<Value, String> {
    Err(five::disabled("fetch_5e_player_home_batch"))
}

#[tauri::command]
fn load_p5e_client_root(state: State<'_, AppState>) -> Value {
    json!({ "clientRoot": state.p5e_root.lock().ok().and_then(|g| g.clone()) })
}

#[tauri::command]
fn save_p5e_client_root(state: State<'_, AppState>, client_root: Option<String>) -> Result<Value, String> {
    *state.p5e_root.lock().map_err(|e| e.to_string())? = client_root.clone();
    let value = json!({ "clientRoot": client_root });
    state::write_json(&state.p5e_path(), &value)?;
    Ok(value)
}

/* ============================ 网络 / 窗口 ============================ */

#[tauri::command]
async fn fetch_http_json(
    state: State<'_, AppState>,
    url: String,
    headers: Option<Value>,
) -> Result<Value, String> {
    net::fetch_json(&state.client, &url, headers).await
}

#[tauri::command]
async fn fetch_proxied_image(
    state: State<'_, AppState>,
    url: String,
    referer: Option<String>,
) -> Result<Value, String> {
    let data = net::fetch_image_data_url(&state.client, &url, referer).await?;
    Ok(json!({ "dataUrl": data }))
}

#[tauri::command]
fn open_app_devtools(app: AppHandle) -> Value {
    if let Some(w) = app.get_webview_window("main") {
        w.open_devtools();
    }
    json!({ "ok": true })
}

#[tauri::command]
fn close_app_devtools(app: AppHandle) -> Value {
    if let Some(w) = app.get_webview_window("main") {
        w.close_devtools();
    }
    json!({ "ok": true })
}

/* ============================ AI ============================ */

#[tauri::command]
fn get_ai_settings_path(state: State<'_, AppState>) -> Value {
    json!({ "path": state.ai_path().to_string_lossy() })
}

#[tauri::command]
fn load_ai_settings(state: State<'_, AppState>) -> Result<Value, String> {
    let raw = state.ai.lock().map_err(|e| e.to_string())?.clone();
    Ok(state::ai_view(&raw))
}

#[tauri::command]
fn save_ai_settings(state: State<'_, AppState>, input: Value) -> Result<Value, String> {
    {
        let mut guard = state.ai.lock().map_err(|e| e.to_string())?;
        let mut merged = guard.clone();
        if let (Some(dst), Some(src)) = (merged.as_object_mut(), input.as_object()) {
            for (k, v) in src {
                if v.as_str().map(|s| !s.is_empty()).unwrap_or(true) {
                    dst.insert(k.clone(), v.clone());
                }
            }
        }
        *guard = merged;
    }
    state.persist_ai()?;
    let raw = state.ai.lock().map_err(|e| e.to_string())?.clone();
    Ok(state::ai_view(&raw))
}

#[tauri::command]
async fn start_ai_analysis(
    app: AppHandle,
    state: State<'_, AppState>,
    input: Value,
) -> Result<Value, String> {
    ai::analyze(app, &state, input).await
}

#[tauri::command]
fn cancel_ai_analysis(state: State<'_, AppState>) -> Value {
    state.ai_cancel.store(true, Ordering::SeqCst);
    json!({ "cancelled": true })
}

/* ============================ 应用 / 更新 ============================ */

#[tauri::command]
fn get_app_version() -> Value {
    json!({
        "name": APP_NAME,
        "version": APP_VERSION,
        "platform": std::env::consts::OS,
    })
}

#[tauri::command]
async fn check_for_update(state: State<'_, AppState>) -> Result<Value, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let v = net::fetch_json(
        &state.client,
        &url,
        Some(json!({ "Accept": "application/vnd.github+json" })),
    )
    .await?;

    let tag = v.get("tag_name").and_then(|x| x.as_str()).unwrap_or("");
    let latest = tag.trim_start_matches('v');
    let download = pick_exe_asset(&v)
        .and_then(|a| a.get("browser_download_url").and_then(|x| x.as_str()).map(|s| s.to_string()));

    Ok(json!({
        "hasUpdate": latest != APP_VERSION && !latest.is_empty(),
        "latestVersion": latest,
        "downloadUrl": download,
        "notes": v.get("body").cloned().unwrap_or(Value::Null),
        "publishedAt": v.get("published_at").cloned().unwrap_or(Value::Null),
    }))
}

#[tauri::command]
async fn list_changelog_releases(state: State<'_, AppState>) -> Result<Value, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases?per_page=50");
    let v = net::fetch_json(
        &state.client,
        &url,
        Some(json!({ "Accept": "application/vnd.github+json" })),
    )
    .await?;
    let list = v
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|r| {
                    json!({
                        "tag": r.get("tag_name").cloned().unwrap_or(Value::Null),
                        "name": r.get("name").cloned().unwrap_or(Value::Null),
                        "body": r.get("body").cloned().unwrap_or(Value::Null),
                        "publishedAt": r.get("published_at").cloned().unwrap_or(Value::Null),
                        "prerelease": r.get("prerelease").cloned().unwrap_or(Value::Null),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(Value::Array(list))
}

#[tauri::command]
async fn get_changelog_release(state: State<'_, AppState>, tag: String) -> Result<Value, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/tags/{tag}");
    let v = net::fetch_json(
        &state.client,
        &url,
        Some(json!({ "Accept": "application/vnd.github+json" })),
    )
    .await?;
    Ok(json!({
        "tag": v.get("tag_name").cloned().unwrap_or(Value::Null),
        "body": v.get("body").cloned().unwrap_or(Value::Null),
    }))
}

fn pick_exe_asset(release: &Value) -> Option<&Value> {
    release
        .get("assets")?
        .as_array()?
        .iter()
        .find(|a| {
            a.get("name")
                .and_then(|n| n.as_str())
                .map(|n| n.to_ascii_lowercase().ends_with(".exe"))
                .unwrap_or(false)
        })
}

#[tauri::command]
async fn download_update(
    app: AppHandle,
    state: State<'_, AppState>,
    version: String,
) -> Result<Value, String> {
    let tag = if version.starts_with('v') {
        version.clone()
    } else {
        format!("v{version}")
    };

    let url = format!("https://api.github.com/repos/{REPO}/releases/tags/{tag}");
    let release = net::fetch_json(
        &state.client,
        &url,
        Some(json!({ "Accept": "application/vnd.github+json" })),
    )
    .await?;

    let asset = pick_exe_asset(&release)
        .cloned()
        .ok_or_else(|| format!("UPDATE: release {tag} 里没有 .exe 资产"))?;

    let dl = asset
        .get("browser_download_url")
        .and_then(|v| v.as_str())
        .ok_or("UPDATE: asset missing browser_download_url")?
        .to_string();
    let name = asset
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("cs-match-helper.exe")
        .to_string();

    let dir = std::env::temp_dir().join("cs-match-helper-update");
    std::fs::create_dir_all(&dir).map_err(|e| format!("UPDATE: {e}"))?;
    let file_path = dir.join(&name);

    let resp = state
        .client
        .get(&dl)
        .send()
        .await
        .map_err(|e| format!("UPDATE_NETWORK: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("UPDATE_HTTP: {}", resp.status().as_u16()));
    }
    let total = resp.content_length().unwrap_or(0);

    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(&file_path)
        .await
        .map_err(|e| format!("UPDATE: {e}"))?;
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("UPDATE_NETWORK: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("UPDATE: {e}"))?;
        downloaded += chunk.len() as u64;
        app.emit(
            "update-progress",
            json!({ "downloaded": downloaded, "total": total }),
        )
        .ok();
    }
    file.flush().await.ok();

    Ok(json!({
        "newExePath": file_path.to_string_lossy(),
        "size": downloaded,
        "version": tag,
    }))
}

#[tauri::command]
fn apply_update_and_restart(app: AppHandle, new_exe_path: String) -> Result<Value, String> {
    std::process::Command::new(&new_exe_path)
        .spawn()
        .map_err(|e| format!("UPDATE: {e}"))?;
    app.exit(0);
    Ok(json!({ "restarted": true }))
}

#[tauri::command]
fn get_comment_client_key() -> Value {
    use rand::Rng;
    let key: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(24)
        .map(char::from)
        .collect();
    json!({ "key": key })
}

#[tauri::command]
fn relaunch_as_admin(app: AppHandle) -> Result<Value, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let script = format!(
        "Start-Process -FilePath '{}' -Verb RunAs",
        exe.to_string_lossy().replace('\'', "''")
    );
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .spawn()
        .map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(json!({ "relaunching": true }))
}

#[tauri::command]
fn set_app_locale(state: State<'_, AppState>, locale: String) -> Result<Value, String> {
    *state.locale.lock().map_err(|e| e.to_string())? = locale.clone();
    state::write_json(&state.data_dir.join("ui.json"), &json!({ "locale": locale }))?;
    Ok(json!({ "locale": locale }))
}

#[tauri::command]
fn close_app(app: AppHandle) -> Value {
    app.exit(0);
    json!({ "closed": true })
}

/* ============================ 历史 ============================ */

#[tauri::command]
fn list_match_history(state: State<'_, AppState>) -> Result<Value, String> {
    let docs = state.history.lock().map_err(|e| e.to_string())?.clone();
    Ok(history::list(&docs))
}

#[tauri::command]
fn list_match_history_documents(state: State<'_, AppState>) -> Result<Value, String> {
    let docs = state.history.lock().map_err(|e| e.to_string())?.clone();
    Ok(history::list(&docs))
}

#[tauri::command]
fn get_match_history_entry(
    state: State<'_, AppState>,
    platform_id: String,
    id: String,
) -> Result<Value, String> {
    let docs = state.history.lock().map_err(|e| e.to_string())?;
    Ok(history::get(&docs, &platform_id, &id))
}

#[tauri::command]
fn upsert_match_history_entry(
    state: State<'_, AppState>,
    document: Value,
) -> Result<Value, String> {
    let out = {
        let mut docs = state.history.lock().map_err(|e| e.to_string())?;
        history::upsert(&mut docs, document)
    };
    state.persist_history()?;
    Ok(out)
}

#[tauri::command]
fn patch_match_history_section(
    state: State<'_, AppState>,
    platform_id: String,
    id: String,
    section_name: String,
    section: Value,
) -> Result<Value, String> {
    let out = {
        let mut docs = state.history.lock().map_err(|e| e.to_string())?;
        history::patch_section(&mut docs, &platform_id, &id, &section_name, section)?
    };
    state.persist_history()?;
    Ok(out)
}

#[tauri::command]
fn delete_match_history_entry(
    state: State<'_, AppState>,
    platform_id: String,
    id: String,
) -> Result<Value, String> {
    let out = {
        let mut docs = state.history.lock().map_err(|e| e.to_string())?;
        history::delete(&mut docs, &platform_id, &id)
    };
    state.persist_history()?;
    Ok(out)
}

#[tauri::command]
fn clear_match_history(state: State<'_, AppState>) -> Result<Value, String> {
    state.history.lock().map_err(|e| e.to_string())?.clear();
    state.persist_history()?;
    Ok(json!({ "cleared": true }))
}

