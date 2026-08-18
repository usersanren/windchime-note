//! 系统托盘：左键切换显隐，右键菜单提供显示/隐藏/锁定/退出。

use std::sync::Arc;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::passthrough::PassthroughState;
use crate::MAIN_WINDOW;

/// 存托盘菜单里的「锁定到桌面」项引用，用于切换勾选状态
pub struct LockMenuItem<R: Runtime>(pub CheckMenuItem<R>);

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示便签", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隐藏便签", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let lock = CheckMenuItem::with_id(app, "lock", "锁定到桌面", true, false, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &sep1, &lock, &sep2, &quit])?;

    app.manage(LockMenuItem(lock.clone()));

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("风铃便签 · Ctrl+Shift+Q 显示/隐藏")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => set_visible(app, true),
            "hide" => set_visible(app, false),
            "lock" => toggle_lock(app),
            "quit" => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let _ = if visible {
        window.show().and_then(|_| window.set_focus())
    } else {
        window.hide()
    };
}

/// 切换"锁定到桌面"：锁定后整窗鼠标穿透（贴纸模式），解锁恢复交互
fn toggle_lock<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<Arc<PassthroughState>>();
    let locked = !state.is_locked();
    let _ = apply_locked(app, locked);
}

/**
 * 应用锁定状态的唯一入口（托盘 / 前端命令共用）：
 * 1) 更新 PassthroughState（驱动穿透轮询）
 * 2) 同步托盘菜单勾选与文案
 * 3) 立即 set_ignore_cursor_events（不等 40ms 轮询，消除延迟）
 * 4) 通知前端切换 UI（禁拖拽 / 隐藏控制按钮）
 */
pub fn apply_locked<R: Runtime>(app: &AppHandle<R>, locked: bool) -> Result<(), String> {
    let state = app.state::<Arc<PassthroughState>>();
    state.set_locked(locked);
    sync_lock_menu(app, locked);
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        window
            .set_ignore_cursor_events(locked)
            .map_err(|e| e.to_string())?;
    }
    app.emit("locked-changed", locked)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 同步托盘「锁定到桌面」菜单项的勾选状态与文案（锁定后显示"解除锁定"）
pub fn sync_lock_menu<R: Runtime>(app: &AppHandle<R>, locked: bool) {
    let lock_item = app.state::<LockMenuItem<R>>();
    let _ = lock_item.0.set_checked(locked);
    let _ = lock_item.0.set_text(if locked {
        "解除锁定"
    } else {
        "锁定到桌面"
    });
}
