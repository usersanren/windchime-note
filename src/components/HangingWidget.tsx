import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { BASE_WINDOW, THEMES } from '../types';
import { useWidgetStore } from '../stores/widgetStore';
import { useDragPosition } from '../hooks/useDragPosition';
import { useQuoteManager } from '../hooks/useQuoteManager';
import { useAutoDailyUpdate } from '../hooks/useAutoDailyUpdate';
import { useCursorPassthrough } from '../hooks/useCursorPassthrough';
import { entranceInitial, usePhysicsSwing } from '../hooks/usePhysicsSwing';
import { hideWindow, setLocked } from '../lib/tauri';
import { Rope, ropeTotalHeight } from './Rope';
import { NoteCard } from './NoteCard';
import { ControlButtons } from './ControlButtons';
import { SettingsPanel } from './SettingsPanel';

/**
 * 布局常量：所有魔法数字集中于此，改布局只改这里。
 * 推导关系（motion.div 顶部为原点）：
 *   ROPE_HEIGHT = 92（绳本体）；Rope 组件实际占用 = 92 + 绳结 12 - 重叠 2 = 102px
 *   卡片顶 = 102 - CARD_TOP_GAP(4) = 98；卡片底 = 98 + CARD_H(220) = 318
 *   BUTTON_TOP = 314（历史视觉值：按钮贴卡片底偏上 4px，勿动）
 *   TEAR_TOP = 278（撕边线，实测相对卡片底 318 上移 40 贴合，历史调优值，勿动）
 *   ZONE 交互热区覆盖绳 + 卡片 + 按钮，左右留 40px 摆动余量
 */
const ROPE_HEIGHT = 92;
const CARD_TOP_GAP = 4; // NoteCard 外层 -mt-[4px]
const CARD_H = 220;
/** 卡片底边 y 坐标：ropeTotalHeight(92) - 4 + 220 = 102 - 4 + 220 = 318 */
const CARD_BOTTOM = ropeTotalHeight(ROPE_HEIGHT) - CARD_TOP_GAP + CARD_H;
const ZONE = { left: 40, top: 0, width: 440, height: 420 } as const;
const BUTTON_TOP = 314;
/** 撕边线绝对定位 top：卡片底 318 - 40 = 278（历史调优值，勿随意改） */
const TEAR_TOP = CARD_BOTTOM - 40;
/** 锁定提示条相对按钮区的偏移 */
const LOCK_HINT_TOP = BUTTON_TOP + 70;

/** 主容器：绳子 + 卡片 + 摆动 / 拖拽 / 设置抽屉 */
export function HangingWidget(): JSX.Element {
  const scale = useWidgetStore((s) => s.scale);
  const theme = useWidgetStore((s) => s.theme);
  const aiEnabled = useWidgetStore((s) => s.ai.enabled);
  const locked = useWidgetStore((s) => s.locked);
  const swingMode = useWidgetStore((s) => s.swingMode);

  const [hovered, setHovered] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 收起状态：便签卷起缩成顶部小圆点（临时 UI 状态，不持久化） */
  const [collapsed, setCollapsed] = useState(false);
  /** P1-5 锁定提示条：锁定瞬间短暂显示，提示如何解锁 */
  const [lockedHint, setLockedHint] = useState(false);
  /** P3-5 右键菜单：null = 关闭，否则记录打开位置（窗口内坐标） */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const zoneRef = useRef<HTMLDivElement>(null);
  /** 收起后的小圆点：作为唯一可交互目标上报鼠标穿透 */
  const dotRef = useRef<HTMLButtonElement>(null);
  const interactiveRefs = useMemo(() => (collapsed ? [dotRef] : [zoneRef]), [collapsed]);

  const { dragging, onDragHandleDown, dragDeltaRef } = useDragPosition();
  const { state, pluck, rotateMV, variants } = usePhysicsSwing(
    // 锁定后鼠标穿透，hovered 会残留 → 强制视为未悬停，只保留 3.2s 微风轻晃
    (hovered || settingsOpen) && !locked,
    dragging,
    swingMode,
    // 仅收起时停摆动（停 rAF + 角度归零）；锁定保留微风（每 3.2s 轻晃一下，贴纸不死板）
    !collapsed,
    dragDeltaRef,
  );
  const { text, flipping, loading, error, refresh, refreshByAi, applyDaily } = useQuoteManager();

  useAutoDailyUpdate(applyDaily);
  useCursorPassthrough(interactiveRefs, dragging || settingsOpen, locked);

  // 拖拽松手：注入余摆（释放瞬间给一个较小的冲量）
  const prevDragging = useRef(dragging);
  useEffect(() => {
    if (prevDragging.current && !dragging) pluck('release');
    prevDragging.current = dragging;
  }, [dragging, pluck]);

  // 锁定（贴纸模式）：禁拖拽、隐藏控制按钮、关闭设置面板；锁定前若已收起则强制展开（贴纸模式需要便签可见）
  useEffect(() => {
    if (locked) {
      setSettingsOpen(false);
      setCollapsed(false);
      // P1-5：锁定瞬间显示 2.5s 提示，告知用户如何解锁（整窗穿透，提示仅视觉）
      setLockedHint(true);
      const timer = setTimeout(() => setLockedHint(false), 2500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [locked]);

  const palette = THEMES[theme];
  const controlsVisible = (hovered || settingsOpen) && !locked && !collapsed;
  const handleDragStart = locked || collapsed ? undefined : onDragHandleDown;

  return (
    <div
      className="absolute left-1/2 top-0"
      style={{
        width: BASE_WINDOW.width,
        height: BASE_WINDOW.height,
        transform: `translateX(-50%) scale(${scale})`,
        transformOrigin: 'top center',
        willChange: 'transform',
      }}
    >
      <div
        ref={zoneRef}
        className="interactive absolute"
        style={{ left: ZONE.left, top: ZONE.top, width: ZONE.width, height: ZONE.height }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtxMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {/* 水平居中放在外层普通 div：避免 Framer Motion 覆盖 Tailwind 的 -translate-x-1/2 导致整体右移 */}
        <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center">
          <motion.div
            className="relative flex flex-col items-center"
            style={{
              transformOrigin: 'top center',
              willChange: 'transform',
              ...(swingMode === 'physics' ? { rotate: rotateMV } : {}),
            }}
            initial={entranceInitial}
            animate={
              collapsed
                ? { scaleY: 0, y: -180, opacity: 0, transition: { duration: 0.45, ease: 'easeInOut' } }
                : state
            }
            variants={variants}
          >
            <Rope height={ROPE_HEIGHT} landed={state !== 'entrance'} />
            <div className="-mt-[4px]">
              <NoteCard
                palette={palette}
                text={text}
                flipping={flipping}
                onMouseDown={handleDragStart}
                onClick={
                  locked || collapsed
                    ? undefined // P3-1：收起动画期间禁交互
                    : () => {
                        setSettingsOpen(false);
                        pluck('click');
                      }
                }
                onDoubleClick={
                  locked || collapsed
                    ? undefined
                    : () => {
                        setSettingsOpen(true); // P3-7 双击打开设置
                        pluck('click');
                      }
                }
              />
            </div>

            {/* 撕边线：随摆动体一体旋转（卡片底部撕出的纸条边缘）。absolute + TEAR_TOP（278）绕开 flex margin 累加误差 */}
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2" style={{ top: TEAR_TOP }}>
              <svg width="160" height="12" viewBox="0 0 160 12" fill="none" aria-hidden style={{ display: 'block' }}>
                <path
                  d="M2 6 Q 12 2, 22 6 T 42 6 T 62 6 T 82 6 T 102 6 T 122 6 T 142 6 T 158 6"
                  stroke="rgba(107,85,57,0.45)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </motion.div>
        </div>

        {/* 收起后的小圆点：悬在窗口顶部居中，点击展开；是收起态唯一可交互目标 */}
        {collapsed && (
          <button
            ref={dotRef}
            type="button"
            title="展开便签"
            onClick={() => {
              setCollapsed(false);
              pluck('release'); // P3-2：展开回弹余摆
            }}
            className="interactive absolute left-1/2 top-[14px] -translate-x-1/2 transition-transform hover:scale-110"
            style={{ willChange: 'transform' }}
          >
            <span
              className="block h-3.5 w-3.5 rounded-full"
              style={{
                background: 'radial-gradient(circle at 35% 30%, #a0826d 0%, #8b6f47 60%, #6f573a 100%)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
              }}
            />
          </button>
        )}

        {/* 控制按钮：悬浮控制层，固定不随摆动（避免点击目标移动造成误点） */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ top: BUTTON_TOP, willChange: 'transform' }}
        >
          <ControlButtons
            visible={controlsVisible}
            aiEnabled={aiEnabled}
            aiLoading={loading}
            onRefresh={refresh}
            onAiRefresh={refreshByAi}
            onLock={() => void setLocked(true)}
            onToggleSettings={() => setSettingsOpen((v) => !v)}
            onCollapse={() => {
              setSettingsOpen(false);
              setCollapsed(true);
            }}
            onClose={() => void hideWindow()}
          />
        </div>

        {/* AI 报错 Toast：醒目深红 + ⚠️ + 重试按钮，4s 自动消失（useQuoteManager 内 timer） */}
        {error && !collapsed && (
          <div
            className="absolute left-1/2 flex w-[300px] -translate-x-1/2 flex-col items-center gap-1.5 rounded-xl bg-[rgba(176,45,36,0.95)] px-3 py-2.5 text-center shadow-xl"
            style={{ top: BUTTON_TOP + 34, willChange: 'opacity, transform' }}
          >
            <div className="flex w-full items-start gap-2 text-left">
              <span className="text-[14px] leading-none">⚠️</span>
              <span className="flex-1 text-[12px] leading-snug text-white">{error}</span>
            </div>
            <button
              type="button"
              onClick={refreshByAi}
              className="interactive rounded-md bg-white/90 px-3 py-1 text-[11px] font-medium text-[#B02D24] transition-colors hover:bg-white"
              style={{ willChange: 'transform' }}
            >
              重试
            </button>
          </div>
        )}

        {/* P1-5 锁定提示：仅视觉，不拦截任何鼠标事件 */}
        {locked && lockedHint && (
          <div
            className="pointer-events-none absolute left-1/2 w-[260px] -translate-x-1/2 rounded-lg bg-[rgba(60,44,28,0.92)] px-3 py-2 text-center text-[11px] leading-snug text-[#FDF6E3] shadow-lg"
            style={{ top: LOCK_HINT_TOP, willChange: 'opacity, transform' }}
          >
            已锁定到桌面（贴纸模式）
            <br />
            右键托盘图标「解除锁定」即可恢复
          </div>
        )}
      </div>

      {/* 设置面板：Portal 到 body，脱离本容器的 transform/scale，任何缩放档位下都保持 100% 大小 */}
      {settingsOpen &&
        createPortal(
          <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />,
          document.body,
        )}

      {/* P3-5 右键菜单：Portal 到 body；点击空白处关闭 */}
      {ctxMenu &&
        createPortal(
          <div
            className="fixed inset-0 z-[60]"
            onMouseDown={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
          >
            <div
              className="interactive absolute w-[150px] rounded-lg border border-[rgba(139,111,71,0.22)] bg-[rgba(253,246,227,0.98)] p-1 shadow-lg"
              style={{
                left: Math.min(ctxMenu.x, window.innerWidth - 160),
                top: Math.min(ctxMenu.y, window.innerHeight - 220),
                fontFamily: 'system-ui, sans-serif',
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setCtxMenu(null);
                  refresh();
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-[#4A3728] hover:bg-[rgba(139,111,71,0.12)]"
              >
                换一句
              </button>
              <button
                type="button"
                onClick={() => {
                  setCtxMenu(null);
                  void setLocked(true);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-[#4A3728] hover:bg-[rgba(139,111,71,0.12)]"
              >
                锁定到桌面
              </button>
              <button
                type="button"
                onClick={() => {
                  setCtxMenu(null);
                  setSettingsOpen(true);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-[#4A3728] hover:bg-[rgba(139,111,71,0.12)]"
              >
                设置
              </button>
              <button
                type="button"
                onClick={() => {
                  setCtxMenu(null);
                  setCollapsed(true);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-[#4A3728] hover:bg-[rgba(139,111,71,0.12)]"
              >
                收起
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
