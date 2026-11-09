use serde_json::{json, Value};

/// 5E 平台适配层。
///
/// 原版通过「结束 5EClient → --remote-debugging-port 重启 → CDP 抓
/// view-arena.5eplay.com 的请求/响应」拿数据；重建版默认关闭整条链路，
/// 只保留状态位与明确的错误码，避免 5E 反作弊与平台风控命中。
pub fn status() -> Value {
    json!({
        "running": false,
        "cdpReady": false,
        "port": Value::Null,
        "installed": Value::Null,
        "launched": false,
    })
}

pub fn disabled(feature: &str) -> String {
    format!("5E_CDP_DISABLED: {feature} 在重建版中默认关闭（原始实现会接管 5EClient 调试端口）")
}
