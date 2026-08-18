//! 暴露给前端的 Tauri 命令。

use std::sync::Arc;

use tauri::{AppHandle, Runtime, State};

use crate::passthrough::{InteractiveRect, PassthroughState};

/// 上报可交互矩形，驱动鼠标穿透
#[tauri::command]
pub fn set_interactive_rect(
    state: State<'_, Arc<PassthroughState>>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) {
    state.update_rect(InteractiveRect {
        x,
        y,
        width,
        height,
    });
}

/// 锁定/解锁：统一走 tray::apply_locked（含立即生效 + 托盘同步 + 前端通知）
#[tauri::command]
pub fn set_locked<R: Runtime>(app: AppHandle<R>, locked: bool) -> Result<(), String> {
    crate::tray::apply_locked(&app, locked)
}

/// 调用 OpenAI 兼容接口生成一句励志短句（桌面端由 Rust 侧发起请求，规避 WebView CORS）
#[tauri::command]
pub async fn generate_ai_quote(
    endpoint: String,
    api_key: String,
    model: String,
    prompt: String,
) -> Result<String, String> {
    // 归一化：自动补全 /chat/completions 后缀（兼容填 base 或完整路径）
    let endpoint = {
        let trimmed = endpoint.trim().trim_end_matches('/');
        if trimmed.ends_with("/chat/completions") {
            trimmed.to_string()
        } else {
            format!("{trimmed}/chat/completions")
        }
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("请求失败: {e}"))?;

    let resp = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "model": model,
            "messages": [{ "role": "user", "content": prompt }],
            // 1.5：高创造性（OpenAI 兼容范围 0–2），用户选择的上限档位
            "temperature": 1.5,
            // 2048：推理型模型「思考过程」消耗大量 token，300 常被思考耗尽导致 content 为空；
            // 短句本身只需约 30 字，大头全在思考（reasoning_content）
            "max_tokens": 2048,
            // ⚠️ 不传 stop：agnet 推理模型会把 stop 立刻命中 → completion_tokens=1 → content 空
        }))
        .send()
        .await
        .map_err(|e| format!("请求失败（请检查接口地址是否正确）: {e}"))?;

    // 非 2xx：按状态码映射为「用户可行动的配置诊断」，并尝试带出服务端 error.message
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let detail = resp
            .text()
            .await
            .ok()
            .and_then(|body| serde_json::from_str::<serde_json::Value>(&body).ok())
            .and_then(|v| v["error"]["message"].as_str().map(|s| s.to_string()))
            .unwrap_or_default();

        let base = match status {
            401 | 403 => "API Key 无效或未授权，请检查填写的 Key".to_string(),
            404 => "接口地址错误，请检查 endpoint（OpenAI 兼容的 /chat/completions 地址）".to_string(),
            400 => "请求参数有误（常见原因：模型名不存在），请检查 model".to_string(),
            429 => "请求过于频繁（限流），请稍后再试".to_string(),
            500..=599 => "AI 服务端暂时不可用，请稍后再试".to_string(),
            _ => format!("接口返回异常状态码 {status}"),
        };
        return Err(if detail.is_empty() {
            base
        } else {
            format!("{base}（{detail}）")
        });
    }

    // 先拿原始文本，便于解析失败时把响应原文带进错误提示（定位格式问题）
    let body_text = resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
    let data: serde_json::Value = serde_json::from_str(&body_text)
        .map_err(|e| format!("响应不是 JSON: {e}（原始响应前 300 字符：{}）", body_text.chars().take(300).collect::<String>()))?;

    // 内容提取（兼容多种响应形态）：
    // 1) content 为字符串
    // 2) content 为数组 [{ type:"text", text:"..." }]（多模态/新版接口）
    // 3) 推理模型：content 为空时回退 reasoning_content
    // 4) choices[0].text（旧式补全格式兜底）
    let message = &data["choices"][0]["message"];
    let mut content = message["content"]
        .as_str()
        .map(|s| s.to_string())
        .unwrap_or_default();
    if content.trim().is_empty() {
        if let Some(parts) = message["content"].as_array() {
            content = parts
                .iter()
                .filter_map(|p| p["text"].as_str())
                .collect::<Vec<_>>()
                .join("");
        }
    }
    if content.trim().is_empty() {
        content = message["reasoning_content"]
            .as_str()
            .unwrap_or_default()
            .to_string();
    }
    if content.trim().is_empty() {
        content = data["choices"][0]["text"].as_str().unwrap_or_default().to_string();
    }
    let content = content.trim().to_string();
    if content.is_empty() {
        // 提取失败：附上原始响应结构，方便用户反馈格式（排除 Key/地址问题后的唯一可能）
        let hint = body_text
            .chars()
            .take(300)
            .collect::<String>()
            .replace('\n', " ")
            .replace('\r', "");
        return Err(format!("无法从响应中解析出句子（原始响应：{hint}）"));
    }
    Ok(content)
}
