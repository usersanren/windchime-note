//! 鼠标穿透：前端上报可交互矩形，后台线程轮询全局光标决定是否忽略鼠标事件。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{Manager, Runtime, WebviewWindow};

use crate::platform::cursor_position;

/// 轮询间隔：40ms 在跟手度与 CPU 占用之间取平衡
const POLL_INTERVAL: Duration = Duration::from_millis(40);
/// 窗口隐藏（托盘）时的降频间隔：1s，避免常驻空转
const POLL_INTERVAL_HIDDEN: Duration = Duration::from_millis(1000);
/// 整窗锁定（贴纸模式）时的降频间隔：1s。锁定后整窗穿透且无需高频跟手，
/// 1Hz 轮询即可（解锁由 set_locked 命令立即生效，不依赖本线程）。
const POLL_INTERVAL_LOCKED: Duration = Duration::from_millis(1000);

/// 前端上报的可交互区域（窗口客户区逻辑坐标）
#[derive(Clone, Copy, Debug, Default)]
pub struct InteractiveRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Default)]
pub struct PassthroughState {
    rect: Mutex<Option<InteractiveRect>>,
    /// 当前是否处于"穿透"状态，避免每帧重复调用系统 API
    ignoring: AtomicBool,
    started: AtomicBool,
    /// 整窗锁定（贴纸模式）：锁定后整窗穿透鼠标事件，忽略交互矩形
    locked: AtomicBool,
}

impl PassthroughState {
    pub fn update_rect(&self, rect: InteractiveRect) {
        if let Ok(mut guard) = self.rect.lock() {
            *guard = Some(rect);
        }
    }

    pub fn set_locked(&self, locked: bool) {
        self.locked.store(locked, Ordering::SeqCst);
    }

    pub fn is_locked(&self) -> bool {
        self.locked.load(Ordering::SeqCst)
    }

    fn snapshot(&self) -> Option<InteractiveRect> {
        self.rect.lock().ok().and_then(|g| *g)
    }
}

/// 启动轮询线程（幂等）
pub fn spawn<R: Runtime>(window: WebviewWindow<R>, state: Arc<PassthroughState>) {
    if state.started.swap(true, Ordering::SeqCst) {
        return;
    }

    thread::spawn(move || loop {
        // 按状态动态选间隔：锁定（1s）/ 正常（40ms）。隐藏分支内部再降频到 1s。
        // 锁定状态原子读，开销≈0；选完间隔后 sleep，锁定期间线程几乎全程休眠。
        let interval = if state.locked.load(Ordering::Relaxed) {
            POLL_INTERVAL_LOCKED
        } else {
            POLL_INTERVAL
        };
        thread::sleep(interval);

        // 窗口关闭后线程自然退出
        if window.app_handle().webview_windows().is_empty() {
            return;
        }
        // P2-2：整窗锁定（贴纸模式）直接穿透——跳过光标查询与坐标换算（只需原子读，开销≈0）
        // 用 swap 拿到旧值：仅首次 false→true 时调用一次系统 API，后续 tick 零系统调用
        if state.locked.load(Ordering::Relaxed) {
            if !state.ignoring.swap(true, Ordering::Relaxed) {
                let _ = window.set_ignore_cursor_events(true);
            }
            continue;
        }
        let Some(rect) = state.snapshot() else {
            continue;
        };
        let Some((cx, cy)) = cursor_position() else {
            continue;
        };
        let Ok(visible) = window.is_visible() else {
            continue;
        };
        // P1-3：窗口隐藏（托盘）时降频到 1s，避免 40ms 常驻空转浪费 CPU
        if !visible {
            thread::sleep(POLL_INTERVAL_HIDDEN);
            continue;
        }

        let (Ok(origin), Ok(scale)) = (window.outer_position(), window.scale_factor()) else {
            continue;
        };
        // 光标换算到窗口客户区逻辑坐标
        let lx = (cx - origin.x) as f64 / scale;
        let ly = (cy - origin.y) as f64 / scale;

        let inside = lx >= rect.x
            && lx <= rect.x + rect.width
            && ly >= rect.y
            && ly <= rect.y + rect.height;
        // 锁定分支已在上方短路，此处只需按交互矩形判断
        let should_ignore = !inside;

        if state.ignoring.load(Ordering::Relaxed) != should_ignore {
            if window.set_ignore_cursor_events(should_ignore).is_ok() {
                state.ignoring.store(should_ignore, Ordering::Relaxed);
            }
        }
    });
}
