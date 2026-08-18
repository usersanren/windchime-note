import { useEffect } from 'react';
import type { RefObject } from 'react';
import { BASE_WINDOW } from '../types';
import { setInteractiveRect } from '../lib/tauri';

/** 交互区外扩，给摆动留出余量，避免鼠标"抖掉" */
const PADDING = 10;
const SAMPLE_MS = 220;

/**
 * 鼠标穿透：周期性把可交互元素的包围盒上报给 Rust，
 * 由 Rust 轮询全局光标决定 set_ignore_cursor_events。
 * 拖拽期间锁定为整窗，避免鼠标移出卡片导致拖拽中断。
 * 锁定（贴纸模式）时整窗穿透，无需上报交互矩形。
 */
export function useCursorPassthrough(
  refs: Array<RefObject<HTMLElement>>,
  dragging: boolean,
  locked: boolean,
): void {
  useEffect(() => {
    // 锁定：整窗穿透，不维护交互矩形（Rust 侧锁定分支已短路，无需任何上报）
    if (locked) return undefined;

    if (dragging) {
      void setInteractiveRect({
        x: 0,
        y: 0,
        width: BASE_WINDOW.width,
        height: BASE_WINDOW.height,
      });
      return undefined;
    }

    let lastKey = '';

    const tick = (): void => {
      let left = Number.POSITIVE_INFINITY;
      let top = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;

      refs.forEach((ref) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
      });

      if (!Number.isFinite(left) || !Number.isFinite(top)) return;

      const payload = {
        x: Math.round(left - PADDING),
        y: Math.round(top - PADDING),
        width: Math.round(right - left + PADDING * 2),
        height: Math.round(bottom - top + PADDING * 2),
      };
      const key = `${payload.x},${payload.y},${payload.width},${payload.height}`;
      if (key === lastKey) return;
      lastKey = key;
      void setInteractiveRect(payload);
    };

    tick();
    const timer = setInterval(tick, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [refs, dragging, locked]);
}
