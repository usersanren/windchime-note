//! 风铃便签 —— 悬挂式桌面励志便签小组件（Tauri v2 后端）

mod commands;
mod passthrough;
mod platform;
mod tray;

use std::sync::Arc;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

use passthrough::PassthroughState;

pub const MAIN_WINDOW: &str = "main";
/// 与前端 BASE_WINDOW 保持一致的逻辑尺寸
const WINDOW_WIDTH: f64 = 520.0;
const WINDOW_HEIGHT: f64 = 520.0;

/// 显示/隐藏便签的全局快捷键：Ctrl + Shift + Q
fn toggle_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyQ)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed || *shortcut != toggle_shortcut() {
                        return;
                    }
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let visible = window.is_visible().unwrap_or(false);
                        let _ = if visible { window.hide() } else { window.show() };
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::set_interactive_rect,
            commands::set_locked,
            commands::generate_ai_quote,
        ])
        .setup(|app| {
            let state = Arc::new(PassthroughState::default());
            app.manage(state.clone());

            let window = build_main_window(app.handle())?;
            tray::setup(app.handle())?;

            // 注册全局快捷键：Ctrl + Shift + Q
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                if let Err(err) = app.handle().global_shortcut().register(toggle_shortcut()) {
                    eprintln!("[shortcut] register failed: {err}");
                }
            }

            passthrough::spawn(window, state);
            Ok(())
        })
        .on_window_event(|window, event| {
            // 关闭请求只隐藏（点击窗口关闭按钮不会退出），退出统一走托盘菜单
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running desktop-note-widget");
}

/// 无边框 / 透明 / 置顶 / 不进任务栏的悬挂窗口
fn build_main_window(app: &tauri::AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    if let Some(existing) = app.get_webview_window(MAIN_WINDOW) {
        return Ok(existing);
    }

    let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::default())
        .title("风铃便签")
        .decorations(false)
        .transparent(true)
        // 置顶保证便签始终可见（不被其他窗口盖住）；
        // "不遮挡"由鼠标穿透承担（非交互区点击穿透到下层）
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
        .position(0.0, 0.0)
        .visible_on_all_workspaces(true)
        .visible(true)
        .build()?;

    center_horizontally(&window);

    Ok(window)
}

/// 初始位置：屏幕顶部水平居中（前端读到持久化位置后会再校正）
fn center_horizontally(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let screen_width = monitor.size().width as f64 / scale;
    let x = ((screen_width - WINDOW_WIDTH) / 2.0).max(0.0);
    let _ = window.set_position(tauri::LogicalPosition::new(x, 0.0));
}
