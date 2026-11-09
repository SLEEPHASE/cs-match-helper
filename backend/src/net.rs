use base64::Engine;
use reqwest::header::{HeaderName, HeaderValue};
use serde_json::Value;

pub fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        s.chars().take(n).collect::<String>() + "…"
    }
}

pub async fn fetch_json(
    client: &reqwest::Client,
    url: &str,
    headers: Option<Value>,
) -> Result<Value, String> {
    let mut req = client.get(url);
    if let Some(Value::Object(map)) = headers {
        for (k, v) in map {
            if let Some(s) = v.as_str() {
                if let (Ok(name), Ok(val)) =
                    (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(s))
                {
                    req = req.header(name, val);
                }
            }
        }
    }
    let resp = req.send().await.map_err(|e| format!("NETWORK: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("NETWORK: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "HTTP {}: {}",
            status.as_u16(),
            truncate(&text, 300)
        ));
    }
    serde_json::from_str(&text).map_err(|e| format!("JSON: {e}"))
}

pub async fn fetch_image_data_url(
    client: &reqwest::Client,
    url: &str,
    referer: Option<String>,
) -> Result<String, String> {
    let mut req = client.get(url);
    if let Some(r) = referer {
        if let Ok(val) = HeaderValue::from_str(&r) {
            req = req.header("Referer", val);
        }
    }
    let resp = req.send().await.map_err(|e| format!("NETWORK: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    let bytes = resp.bytes().await.map_err(|e| format!("NETWORK: {e}"))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}
