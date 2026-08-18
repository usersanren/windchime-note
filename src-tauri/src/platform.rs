//! 平台相关能力。非 Windows 目标退化为空实现，保证跨平台可编译。
//!
//! 注意：透明度已改为前端 CSS opacity，LWA 分层窗口代码已删除（见 OPTIMIZATION_REVIEW P2-2）。

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

    /// 屏幕坐标下的全局鼠标位置（物理像素）
    pub fn cursor_position() -> Option<(i32, i32)> {
        let mut point = POINT { x: 0, y: 0 };
        // SAFETY: point 是栈上有效的可写内存
        let ok = unsafe { GetCursorPos(&mut point) };
        if ok == 0 {
            None
        } else {
            Some((point.x, point.y))
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn cursor_position() -> Option<(i32, i32)> {
        None
    }
}

pub use imp::cursor_position;
