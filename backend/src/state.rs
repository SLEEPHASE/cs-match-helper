use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct FiveState {
    pub running: bool,
    pub port: Option<u16>,
    pub cdp_ready: bool,
}

pub struct AppState {
    pub data_dir: PathBuf,
    pub client: reqwest::Client,
    pub history: Mutex<Vec<Value>>,
    pub auth: Mutex<Option<Value>>,
    pub ai: Mutex<Value>,
    pub locale: Mutex<String>,
    pub five: Mutex<FiveState>,
    pub p5e_root: Mutex<Option<String>>,
    pub log_watch: AtomicBool,
    pub ai_cancel: AtomicBool,
}

pub fn read_json(path: &PathBuf, fallback: Value) -> Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or(fallback)
}

pub fn write_json(path: &PathBuf, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

impl AppState {
    pub fn new(app: &AppHandle) -> Self {
        let data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let _ = std::fs::create_dir_all(&data_dir);

        let history_doc = read_json(&data_dir.join("history.json"), json!({ "documents": [] }));
        let documents = history_doc
            .get("documents")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let auth = read_json(&data_dir.join("auth.json"), Value::Null);
        let auth = if auth.is_null() { None } else { Some(auth) };

        let ai = read_json(
            &data_dir.join("ai-settings.json"),
            json!({
                "analysisEnabled": false,
                "providerMode": "deepseek",
                "baseUrl": "https://api.deepseek.com",
                "model": "deepseek-chat",
                "thinkingEnabled": false,
                "reasoningEffort": "medium",
                "autoAnalyze": true,
                "timeoutMs": 60000
            }),
        );

        let locale = read_json(&data_dir.join("ui.json"), json!({ "locale": "zh-CN" }))
            .get("locale")
            .and_then(|v| v.as_str())
            .unwrap_or("zh-CN")
            .to_string();

        let p5e_root = read_json(&data_dir.join("p5e.json"), Value::Null)
            .get("clientRoot")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Self {
            data_dir,
            client: reqwest::Client::builder()
                .user_agent("CSMatchHelper/3 PerfectPassport")
                .build()
                .unwrap_or_default(),
            history: Mutex::new(documents),
            auth: Mutex::new(auth),
            ai: Mutex::new(ai),
            locale: Mutex::new(locale),
            five: Mutex::new(FiveState::default()),
            p5e_root: Mutex::new(p5e_root),
            log_watch: AtomicBool::new(false),
            ai_cancel: AtomicBool::new(false),
        }
    }

    pub fn history_path(&self) -> PathBuf {
        self.data_dir.join("history.json")
    }
    pub fn auth_path(&self) -> PathBuf {
        self.data_dir.join("auth.json")
    }
    pub fn ai_path(&self) -> PathBuf {
        self.data_dir.join("ai-settings.json")
    }
    pub fn p5e_path(&self) -> PathBuf {
        self.data_dir.join("p5e.json")
    }

    pub fn persist_history(&self) -> Result<(), String> {
        let docs = self.history.lock().map_err(|e| e.to_string())?.clone();
        write_json(&self.history_path(), &json!({ "documents": docs }))
    }
    pub fn persist_auth(&self) -> Result<(), String> {
        let auth = self.auth.lock().map_err(|e| e.to_string())?.clone();
        write_json(&self.auth_path(), &auth.unwrap_or(Value::Null))
    }
    pub fn persist_ai(&self) -> Result<(), String> {
        let ai = self.ai.lock().map_err(|e| e.to_string())?.clone();
        write_json(&self.ai_path(), &ai)
    }
}

/// 前端期望的 AI 设置视图：隐藏明文 Key，只给 masked
pub fn ai_view(raw: &Value) -> Value {
    let key = raw.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");
    let masked = if key.len() > 8 {
        format!("{}****{}", &key[..4], &key[key.len() - 4..])
    } else if key.is_empty() {
        String::new()
    } else {
        "****".to_string()
    };
    let mut out = raw.clone();
    if let Some(obj) = out.as_object_mut() {
        obj.insert("hasApiKey".into(), json!(!key.is_empty()));
        obj.insert("apiKeyMasked".into(), json!(masked));
        obj.insert("apiKey".into(), json!(""));
    }
    out
}
