//! Windows 桌面嵌入：将窗口挂载到系统桌面 WorkerW，实现"只在桌面显示"。
//! 经典 hack：Progman(0x052C) -> 创建 WorkerW -> 找含 SHELLDLL_DefView 的 WorkerW
//! 的下一个兄弟 WorkerW，把窗口 SetParent 过去。

use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, FindWindowW, SendMessageW, SetParent,
};

const WM_SPAWN_WORKERW: u32 = 0x052C;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn find_defview_parent(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let defview = FindWindowExW(
        hwnd,
        std::ptr::null_mut(),
        wide("SHELLDLL_DefView").as_ptr(),
        std::ptr::null(),
    );
    if !defview.is_null() {
        *(lparam as *mut HWND) = hwnd;
        return 0; // 停止枚举
    }
    1
}

unsafe extern "system" fn find_next_workerw(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let state = lparam as *mut (HWND, bool);
    let (target, passed) = &mut *state;
    if hwnd == *target {
        *passed = true;
        return 1; // 越过 DefView 父窗口，继续找下一个
    }
    if *passed {
        let defview = FindWindowExW(
            hwnd,
            std::ptr::null_mut(),
            wide("SHELLDLL_DefView").as_ptr(),
            std::ptr::null(),
        );
        if defview.is_null() {
            *target = hwnd; // 找到桌面 WorkerW
            return 0;
        }
    }
    1
}

/// 把窗口挂到桌面 WorkerW。失败时兜底挂 Progman。
pub fn embed_to_desktop(hwnd: HWND) {
    unsafe {
        let progman = FindWindowW(wide("Progman").as_ptr(), std::ptr::null());
        if progman.is_null() {
            return;
        }

        // 触发 Progman 创建 WorkerW（Windows 8+ 需要）
        SendMessageW(progman, WM_SPAWN_WORKERW, 0, 0);

        let mut holder: HWND = std::ptr::null_mut();
        EnumWindows(Some(find_defview_parent), &mut holder as *mut HWND as LPARAM);

        if holder.is_null() {
            // 兜底：直接挂 Progman
            SetParent(hwnd, progman);
            return;
        }

        let mut state: (HWND, bool) = (holder, false);
        EnumWindows(Some(find_next_workerw), &mut state as *mut (HWND, bool) as LPARAM);

        let desktop = if state.0 != holder { state.0 } else { progman };
        SetParent(hwnd, desktop);
    }
}
