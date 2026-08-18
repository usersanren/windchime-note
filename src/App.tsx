import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { HangingWidget } from './components/HangingWidget';
import { useWidgetStore } from './stores/widgetStore';
import { BASE_WINDOW } from './types';
import {
  getAutoStart,
  getMonitors,
  setLocked,
  setWindowPosition,
  setWindowSize,
} from './lib/tauri';

export default function App(): JSX.Element | null {
  const hydrated = useWidgetStore((s) => s.hydrated);
  const hydrate = useWidgetStore((s) => s.hydrate);
  const scale = useWidgetStore((s) => s.scale);
  const opacity = useWidgetStore((s) => s.opacity);
  const locked = useWidgetStore((s) => s.locked);
  const setPosition = useWidgetStore((s) => s.setPosition);
  const setAutoStartEnabled = useWidgetStore((s) => s.setAutoStartEnabled);
  const setLockedState = useWidgetStore((s) => s.setLocked);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // 托盘/命令切换锁定状态时，同步到 store（UI 禁交互）
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return undefined;
    const unlisten = listen<boolean>('locked-changed', (event) => {
      setLockedState(event.payload);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [setLockedState]);

  // 启动时恢复持久化的锁定状态（重启后仍然穿透）
  useEffect(() => {
    if (!hydrated || !locked) return;
    void setLocked(true);
  }, [hydrated, locked]);

  // 窗口尺寸与位置：窗口固定 BASE_WINDOW 大小（设置面板 fixed 100% 显示，不随 scale 缩小），
  // 仅便签内容在 UI 内做 transform 缩放；位置按"保存位置所在显示器"恢复并钳制，首次运行时顶部居中
  useEffect(() => {
    if (!hydrated) return;
    void (async () => {
      const width = BASE_WINDOW.width;
      const height = BASE_WINDOW.height;
      await setWindowSize(width, height);

      const monitors = await getMonitors();
      const saved = useWidgetStore.getState().position.x;
      // 找到保存位置落在哪个显示器（虚拟桌面坐标，副屏可能是负 x；null = 未初始化），找不到回退第一个
      const target =
        saved !== null
          ? monitors.find((m) => saved >= m.x && saved <= m.x + m.width)
          : undefined;
      const base = target ?? monitors[0] ?? { x: 0, y: 0, width: 1920, height: 1080 };
      const maxX = Math.max(0, base.width - width);
      const nextX =
        saved === null
          ? Math.round(base.x + maxX / 2) // 首次：目标屏顶部居中
          : Math.min(Math.max(saved, base.x), base.x + maxX); // 恢复：钳制在保存位置所在屏内（支持负坐标）
      await setWindowPosition(nextX, base.y);
      if (nextX !== saved) setPosition({ x: nextX, y: base.y });
    })();
  }, [hydrated, scale, setPosition]);

  // 与系统实际的开机自启状态对齐，避免设置漂移
  useEffect(() => {
    if (!hydrated) return;
    void getAutoStart().then((actual) => {
      if (actual !== useWidgetStore.getState().autoStartEnabled) setAutoStartEnabled(actual);
    });
  }, [hydrated, setAutoStartEnabled]);

  if (!hydrated) return null;

  return (
    <div
      className="relative h-full w-full"
      style={{ opacity, willChange: 'opacity' }}
    >
      <HangingWidget />
    </div>
  );
}
