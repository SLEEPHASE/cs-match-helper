use serde_json::{json, Value};

fn id_of(doc: &Value) -> (String, String) {
    (
        doc.get("platformId")
            .and_then(|v| v.as_str())
            .unwrap_or("perfect")
            .to_string(),
        doc.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    )
}

pub fn list(docs: &[Value]) -> Value {
    Value::Array(docs.to_vec())
}

pub fn get(docs: &[Value], platform_id: &str, id: &str) -> Value {
    docs.iter()
        .find(|d| {
            d.get("platformId").and_then(|v| v.as_str()) == Some(platform_id)
                && d.get("id").and_then(|v| v.as_str()) == Some(id)
        })
        .cloned()
        .unwrap_or(Value::Null)
}

pub fn upsert(docs: &mut Vec<Value>, doc: Value) -> Value {
    let (p, i) = id_of(&doc);
    if let Some(slot) = docs.iter_mut().find(|d| {
        d.get("platformId").and_then(|v| v.as_str()) == Some(p.as_str())
            && d.get("id").and_then(|v| v.as_str()) == Some(i.as_str())
    }) {
        let mut merged = slot.clone();
        if let (Some(dst), Some(src)) = (merged.as_object_mut(), doc.as_object()) {
            for (k, v) in src {
                dst.insert(k.clone(), v.clone());
            }
        }
        *slot = merged.clone();
        return merged;
    }
    docs.push(doc.clone());
    doc
}

pub fn patch_section(
    docs: &mut Vec<Value>,
    platform_id: &str,
    id: &str,
    section_name: &str,
    section: Value,
) -> Result<Value, String> {
    for d in docs.iter_mut() {
        if d.get("platformId").and_then(|v| v.as_str()) == Some(platform_id)
            && d.get("id").and_then(|v| v.as_str()) == Some(id)
        {
            if let Some(obj) = d.as_object_mut() {
                let sections = obj
                    .entry("sections")
                    .or_insert_with(|| json!({}));
                if let Some(map) = sections.as_object_mut() {
                    map.insert(section_name.to_string(), section);
                }
            }
            return Ok(d.clone());
        }
    }
    Err("MATCH_HISTORY: entry not found".into())
}

pub fn delete(docs: &mut Vec<Value>, platform_id: &str, id: &str) -> Value {
    let before = docs.len();
    docs.retain(|d| {
        !(d.get("platformId").and_then(|v| v.as_str()) == Some(platform_id)
            && d.get("id").and_then(|v| v.as_str()) == Some(id))
    });
    json!({ "deleted": before != docs.len() })
}
