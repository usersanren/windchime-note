import { useCallback, useEffect, useRef, useState } from 'react';
import { useWidgetStore } from '../stores/widgetStore';
import { BASE_WINDOW } from '../types';
import {
  getMonitors,
  getWindowPosition,
  getWindowScaleFactor,
  setWindowPosition,
} from '../lib/tauri';

interface DragSession {
  /** 按下时的 screenX（物理像素），后续位移以此换算 */
  startPointerX: number;
  /** 窗口 DPI 缩放因子：物理位移 ÷ factor = 逻辑位移 */
  scaleFactor: number;
  /** 按下时窗口 X（逻辑坐标，可负） */
  startWindowX: number;
  /** 可拖范围（逻辑坐标，按「窗口所在显示器」钳制，支持副屏负值） */
  minX: number;
  maxX: number;
  /** 是否已确认进入拖拽（移动超过阈值） */
  active: boolean;
}

/** 位移阈值（px，物理像素）：超过才视为拖拽，原地按下松开 = 点击（不触发拖拽状态） */
const DRAG_THRESHOLD = 4;

/**
 * 水平拖拽定位：只改变窗口 X 坐标（绳子始终从屏幕顶部垂下）。
 * 用 screenX 计算位移，避免窗口跟随移动导致的坐标漂移。
 * 点击（无位移）不会进入 dragging——避免物理摆动的角度/动量被清零造成"卡顿"。
 *
 * P0-1 修复：screenX 是物理像素，窗口坐标是逻辑像素 → 位移统一除以 scaleFactor，
 *          避免高 DPI 缩放下拖拽位移被放大（125% 屏拖 100px 走 125px 的问题）。
 * P0-2 修复：可拖范围按「窗口所在显示器」钳制（minX 可为负），
 *          副屏（虚拟坐标 x<0）不再被硬拉回主屏边缘。
 */
export function useDragPosition(): {
  dragging: boolean;
  onDragHandleDown: (event: React.MouseEvent) => void;
  /** 最近一次 mousemove 的水平位移增量（逻辑 px，向右为正），供物理摆动注入"滞后动量" */
  dragDeltaRef: React.MutableRefObject<number>;
} {
  const scale = useWidgetStore((s) => s.scale);
  const setPosition = useWidgetStore((s) => s.setPosition);
  const [dragging, setDragging] = useState(false);
  const sessionRef = useRef<DragSession | null>(null);
  const latestXRef = useRef(0);
  const lastMoveXRef = useRef(0);
  const dragDeltaRef = useRef(0);
  const releasedRef = useRef(false); // 本次按下是否已松开（避免异步回填残留 session）

  const onDragHandleDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const pointerX = event.screenX;
      releasedRef.current = false;

      void (async () => {
        const [winPos, monitors, factor] = await Promise.all([
          getWindowPosition(),
          getMonitors(),
          getWindowScaleFactor(),
        ]);
        // 异步完成前已松开（纯点击）→ 不建立 session，避免残留
        if (releasedRef.current) return;
        const windowWidth = Math.round(BASE_WINDOW.width * scale);
        // 以窗口当前位置定位所在显示器（逻辑坐标，副屏 x 可能为负），找不到回退首屏
        const monitor =
          monitors.find((m) => winPos.x >= m.x && winPos.x <= m.x + m.width) ??
          monitors[0] ?? { x: 0, width: 1920 };
        const minX = monitor.x;
        const maxX = Math.max(minX, monitor.x + monitor.width - windowWidth);
        sessionRef.current = {
          startPointerX: pointerX,
          scaleFactor: factor,
          startWindowX: winPos.x,
          minX,
          maxX,
          active: false,
        };
        latestXRef.current = winPos.x;
        lastMoveXRef.current = pointerX;
      })();
    },
    [scale],
  );

  useEffect(() => {
    const handleMove = (event: MouseEvent): void => {
      const session = sessionRef.current;
      if (!session) return;
      const delta = (event.screenX - session.startPointerX) / session.scaleFactor; // 物理 → 逻辑
      if (!session.active) {
        // 阈值内：视为点击（可能是拖拽前摇），不进入拖拽状态
        if (Math.abs(delta) < DRAG_THRESHOLD / session.scaleFactor) return;
        session.active = true;
        setDragging(true);
      }
      // 记录本次位移增量（逻辑 px，供物理摆动注入滞后动量）
      dragDeltaRef.current = (event.screenX - lastMoveXRef.current) / session.scaleFactor;
      lastMoveXRef.current = event.screenX;
      const next = Math.min(session.maxX, Math.max(session.minX, session.startWindowX + delta));
      latestXRef.current = next;
      void setWindowPosition(next, 0);
    };

    const handleUp = (): void => {
      releasedRef.current = true;
      dragDeltaRef.current = 0;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session?.active) {
        setDragging(false);
        setPosition({ x: Math.round(latestXRef.current), y: 0 });
      }
      // 未 active = 点击：dragging 从未为 true，物理摆动不被清零，release 也不会误触发
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [scale, setPosition]);

  return { dragging, onDragHandleDown, dragDeltaRef };
}
