use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter};

use crate::state::AppState;

fn chat_url(base: &str) -> String {
    let b = base.trim().trim_end_matches('/');
    if b.ends_with("/chat/completions") {
        b.to_string()
    } else {
        format!("{b}/chat/completions")
    }
}

pub async fn analyze(
    app: AppHandle,
    state: &AppState,
    input: Value,
) -> Result<Value, String> {
    let settings = state.ai.lock().map_err(|e| e.to_string())?.clone();

    let enabled = settings
        .get("analysisEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !enabled {
        return Err("AI_DISABLED: analysis is turned off in settings".into());
    }

    let api_key = settings
        .get("apiKey")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if api_key.is_empty() {
        return Err("AI_KEY_MISSING: configure an API key first".into());
    }

    let base_url = settings
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("https://api.deepseek.com")
        .to_string();
    let model = settings
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("deepseek-chat")
        .to_string();

    let match_id = input
        .get("matchId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let system_prompt = input
        .get("systemPrompt")
        .and_then(|v| v.as_str())
        .unwrap_or("你是 CS 对局数据分析助手，请基于给出的数据给出简洁结论。")
        .to_string();
    let user_prompt = input
        .get("prompt")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            input
                .get("match")
                .map(|m| m.to_string())
                .unwrap_or_else(|| "{}".to_string())
        });

    state.ai_cancel.store(false, Ordering::SeqCst);
    app.emit(
        "ai-analysis-start",
        json!({ "matchId": match_id, "model": model }),
    )
    .ok();

    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "stream": false,
        "temperature": 0.3
    });

    let resp = state
        .client
        .post(chat_url(&base_url))
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("AI_NETWORK: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("AI_NETWORK: {e}"))?;

    if !status.is_success() {
        app.emit(
            "ai-analysis-error",
            json!({ "matchId": match_id, "message": crate::net::truncate(&text, 400) }),
        )
        .ok();
        return Err(format!("AI_HTTP: {} {}", status.as_u16(), crate::net::truncate(&text, 300)));
    }

    let payload: Value =
        serde_json::from_str(&text).map_err(|e| format!("AI_PROTOCOL: {e}"))?;
    let content = payload
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // 原版是 SSE 流式推送；这里分片回放，保证前端 ai-analysis-delta 逻辑照常工作
    let chars: Vec<char> = content.chars().collect();
    let mut i = 0usize;
    while i < chars.len() {
        if state.ai_cancel.load(Ordering::SeqCst) {
            app.emit("ai-analysis-cancelled", json!({ "matchId": match_id }))
                .ok();
            return Ok(json!({ "cancelled": true }));
        }
        let end = (i + 60).min(chars.len());
        let delta: String = chars[i..end].iter().collect();
        app.emit(
            "ai-analysis-delta",
            json!({ "matchId": match_id, "delta": delta }),
        )
        .ok();
        i = end;
        tokio::time::sleep(std::time::Duration::from_millis(8)).await;
    }

    app.emit(
        "ai-analysis-done",
        json!({
            "matchId": match_id,
            "text": content,
            "usage": payload.get("usage").cloned().unwrap_or(Value::Null)
        }),
    )
    .ok();

    Ok(json!({ "text": content, "usage": payload.get("usage").cloned().unwrap_or(Value::Null) }))
}


