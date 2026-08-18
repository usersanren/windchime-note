/**
 * Tauri 适配层。
 * 所有系统级调用都收敛在这里，浏览器环境自动降级为无副作用实现，
 * 保证 `npm run dev` 时前端可以独立预览与调试。
 */
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, currentMonitor, availableMonitors } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** 静默包装：桌面 API 失败不应该让界面崩掉 */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!isTauri()) return fallback;
  try {
    return await fn();
  } catch (err) {
    console.warn('[tauri] call failed:', err);
    return fallback;
  }
}

/** 鼠标穿透：卡片区域外的点击直接落到桌面 */
export function setIgnoreCursorEvents(ignore: boolean): Promise<void> {
  return safe(async () => {
    await getCurrentWindow().setIgnoreCursorEvents(ignore);
  }, undefined);
}

/**
 * 上报可交互矩形（相对窗口客户区的逻辑坐标）。
 * Rust 侧据此轮询全局光标位置，自动切换鼠标穿透。
 */
export function setInteractiveRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<void> {
  return safe(async () => {
    await invoke('set_interactive_rect', {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }, undefined);
}

export function setWindowPosition(x: number, y: number): Promise<void> {
  return safe(async () => {
    await getCurrentWindow().setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
  }, undefined);
}

export function setWindowSize(width: number, height: number): Promise<void> {
  return safe(async () => {
    await getCurrentWindow().setSize(new LogicalSize(Math.round(width), Math.round(height)));
  }, undefined);
}

/** 锁定/解锁（贴纸模式）：锁定后整窗鼠标穿透 */
export function setLocked(locked: boolean): Promise<void> {
  return safe(async () => {
    await invoke('set_locked', { locked });
  }, undefined);
}

/** 当前显示器逻辑宽高，浏览器下退化为 screen 对象 */
export async function getScreenSize(): Promise<{ width: number; height: number }> {
  const fallback = {
    width: typeof screen !== 'undefined' ? screen.width : 1920,
    height: typeof screen !== 'undefined' ? screen.height : 1080,
  };
  return safe(async () => {
    const monitor = await currentMonitor();
    if (!monitor) return fallback;
    const factor = monitor.scaleFactor || 1;
    return {
      width: Math.round(monitor.size.width / factor),
      height: Math.round(monitor.size.height / factor),
    };
  }, fallback);
}

/** 全部显示器逻辑信息（含虚拟桌面坐标），浏览器下降级为单个屏幕 */
export async function getMonitors(): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
  const fallback = [
    {
      x: 0,
      y: 0,
      width: typeof screen !== 'undefined' ? screen.width : 1920,
      height: typeof screen !== 'undefined' ? screen.height : 1080,
    },
  ];
  return safe(async () => {
    const monitors = await availableMonitors();
    return monitors.map((m) => {
      const factor = m.scaleFactor || 1;
      return {
        x: Math.round(m.position.x / factor),
        y: Math.round(m.position.y / factor),
        width: Math.round(m.size.width / factor),
        height: Math.round(m.size.height / factor),
      };
    });
  }, fallback);
}

export async function getWindowPosition(): Promise<{ x: number; y: number }> {
  return safe(async () => {
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const factor = await win.scaleFactor();
    return { x: Math.round(pos.x / factor), y: Math.round(pos.y / factor) };
  }, { x: 0, y: 0 });
}

/** 当前窗口的 DPI 缩放因子（浏览器降级为 1），供物理/逻辑坐标换算 */
export async function getWindowScaleFactor(): Promise<number> {
  return safe(async () => {
    const win = getCurrentWindow();
    return await win.scaleFactor();
  }, 1);
}

export function hideWindow(): Promise<void> {
  return safe(async () => {
    await getCurrentWindow().hide();
  }, undefined);
}

/** 开机自启：由 Rust autostart 插件托管 */
export async function setAutoStart(enabled: boolean): Promise<boolean> {
  return safe(async () => {
    const mod = await import('@tauri-apps/plugin-autostart');
    if (enabled) await mod.enable();
    else await mod.disable();
    return await mod.isEnabled();
  }, enabled);
}

export async function getAutoStart(): Promise<boolean> {
  return safe(async () => {
    const mod = await import('@tauri-apps/plugin-autostart');
    return await mod.isEnabled();
  }, false);
}
