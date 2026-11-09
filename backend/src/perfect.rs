use reqwest::header::{HeaderMap, HeaderValue};
use serde_json::{json, Value};

pub const PWA_BASE: &str = "https://pwaweblogin.wmpvp.com";
pub const PASSPORT_BASE: &str = "https://passport.pwesports.cn";

fn headers(token: &str, steam_id: &str) -> HeaderMap {
    let mut h = HeaderMap::new();
    if let Ok(v) = HeaderValue::from_str(token) {
        h.insert("access_token", v);
    }
    if let Ok(v) = HeaderValue::from_str(steam_id) {
        h.insert("PwaSteamId", v);
    }
    h.insert("Referer", HeaderValue::from_static("https://client.wmpvp.com"));
    h.insert("Origin", HeaderValue::from_static("https://client.wmpvp.com"));
    h.insert(
        "User-Agent",
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ),
    );
    h
}

fn token_of(auth: &Option<Value>) -> Option<(String, String)> {
    let a = auth.as_ref()?;
    let token = a.get("accessToken").and_then(|v| v.as_str())?.to_string();
    let steam = a
        .get("steamId")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    Some((token, steam))
}

pub async fn api_get(
    client: &reqwest::Client,
    path: &str,
    query: &[(&str, String)],
    auth: &Option<Value>,
) -> Result<Value, String> {
    let (token, steam) = token_of(auth)
        .ok_or_else(|| "PERFECT_AUTH_REQUIRED: sign in before requesting player data".to_string())?;

    let url = format!("{PWA_BASE}{path}");
    let resp = client
        .get(&url)
        .query(query)
        .headers(headers(&token, &steam))
        .send()
        .await
        .map_err(|e| format!("PERFECT_NETWORK: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("PERFECT_NETWORK: {e}"))?;

    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("PERFECT_AUTH_INVALID: saved session expired".into());
    }
    if !status.is_success() {
        return Err(format!(
            "PERFECT_HTTP: {} {}",
            status.as_u16(),
            crate::net::truncate(&text, 300)
        ));
    }

    let v: Value = serde_json::from_str(&text)
        .map_err(|e| format!("PERFECT_PROTOCOL: invalid JSON response: {e}"))?;

    // 完美接口常见的 { code, data } 信封
    if let Some(code) = v.get("code").and_then(|c| c.as_i64()) {
        if code != 0 {
            let msg = v
                .get("message")
                .or_else(|| v.get("msg"))
                .and_then(|m| m.as_str())
                .unwrap_or("unknown");
            return Err(format!("PERFECT_PROTOCOL: code {code}: {msg}"));
        }
        if let Some(data) = v.get("data") {
            return Ok(data.clone());
        }
    }
    Ok(v)
}

pub async fn player_stats(
    client: &reqwest::Client,
    steam_id: &str,
    auth: &Option<Value>,
) -> Result<Value, String> {
    let overview = api_get(
        client,
        "/user-info/overview",
        &[("steam_id", steam_id.to_string())],
        auth,
    )
    .await?;

    let season = api_get(
        client,
        "/user-info/season-stats",
        &[
            ("steam_id", steam_id.to_string()),
            ("need_max_score", "true".into()),
            ("stats_list", "ladder,map,weapon,individual_peak".into()),
        ],
        auth,
    )
    .await
    .unwrap_or(Value::Null);

    let ladder = api_get(
        client,
        "/user-info/season-ladder-score-list",
        &[("steam_id", steam_id.to_string())],
        auth,
    )
    .await
    .unwrap_or(Value::Null);

    Ok(json!({
        "steamId": steam_id,
        "overview": overview,
        "season": season,
        "ladder": ladder,
    }))
}
