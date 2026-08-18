import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValue, type MotionValue, type Variants } from 'framer-motion';

export type SwingState = 'entrance' | 'idle' | 'hover' | 'drag' | 'pluck' | 'stopped';

/** 入场降落时长（毫秒），与 entrance 动画保持一致 */
const ENTRANCE_MS = 1250;
/** 经典模式拨动动画时长 */
const PLUCK_MS = 1900;

/** 锁定/收起等静止态：摆动完全停止（物理 rotate 归零由 hook 内 rAF 处理，此处只管 y/opacity） */
const STOPPED_VARIANT = { y: 0, opacity: 1 } as const;

/**
 * 物理摆动参数：集中于此便于调手感。
 * 物理含义：K 刚度（决定固有角频率 ω=√K≈3）、阻尼越大衰减越快；
 * 冲量 = 目标摆幅 × ω，因此改摆幅需按 ω 换算冲量（pluck 内 base 即冲量）。
 */
const SWING_PARAMS = {
  /** 弹簧刚度：决定周期 */
  K: 9,
  /** 悬停阻尼 */
  DAMP_HOVER: 0.2,
  /** 拖拽阻尼 */
  DAMP_DRAG: 0.26,
  /** 拖拽注入角速度上限（deg/s），防猛甩 */
  DRAG_MAX_VELOCITY: 60,
  /** 拖拽滞后动量系数：delta × 0.5 注入角速度 */
  DRAG_LAG_FACTOR: 0.5,
  /** 摆幅限幅（度），到边界做弹性反弹 */
  MAX_ANGLE: 15,
  /** 反弹能量保留系数（速度反转 × 0.4） */
  BOUNCE_FACTOR: 0.4,
  /** 入场初始角速度（≈8° 摆幅） */
  ENTRANCE_VELOCITY: 24,
  /** 悬停正弦风激励幅度 */
  HOVER_WIND_AMP: 38,
  /** 悬停正弦风周期（ms） */
  HOVER_WIND_PERIOD: 820,
  /** 微风触发条件：角度与速度阈值 */
  BREEZE_ANGLE_THRESHOLD: 0.15,
  BREEZE_VELOCITY_THRESHOLD: 0.8,
  /** 微风间隔（ms） */
  BREEZE_INTERVAL: 3200,
  /** 微风冲量范围（±10） */
  BREEZE_IMPULSE: 10,
  /** 点击拨动冲量下限/幅度 */
  PLUCK_CLICK_BASE: 24,
  PLUCK_CLICK_RANDOM: 12,
  /** 拖拽松手余摆冲量 */
  PLUCK_RELEASE_BASE: 12,
  PLUCK_RELEASE_RANDOM: 8,
} as const;

/* ==================== 经典模式（B）：增强关键帧 ==================== */

function buildClassicVariants(idleAmp: number): Variants {
  const hoverAmp = 5.5;
  return {
    // 经典模式的停止需显式 rotate: 0（打断 repeat: Infinity 的循环动画）
    stopped: { ...STOPPED_VARIANT, rotate: 0 },
    entrance: {
      y: 0,
      opacity: 1,
      rotate: [0, 3.5, -3, 1.8, -1.2, 0],
      transition: {
        y: { duration: 1.2, ease: 'easeOut' },
        opacity: { duration: 0.6, ease: 'easeOut' },
        rotate: { duration: 2, ease: 'easeInOut', times: [0, 0.2, 0.4, 0.6, 0.8, 1] },
      },
    },
    idle: {
      y: 0,
      opacity: 1,
      rotate: [0, idleAmp, -idleAmp, idleAmp * 0.5, -idleAmp * 0.5, 0],
      transition: {
        rotate: {
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.2, 0.4, 0.6, 0.8, 1],
        },
      },
    },
    hover: {
      y: 0,
      opacity: 1,
      rotate: [0, hoverAmp, -hoverAmp, hoverAmp * 0.55, -hoverAmp * 0.55, 0],
      transition: {
        rotate: {
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.2, 0.4, 0.6, 0.8, 1],
        },
      },
    },
    pluck: {
      y: 0,
      opacity: 1,
      rotate: [0, 8, -5.5, 3.2, -2, 1, -0.5, 0],
      transition: {
        rotate: { duration: PLUCK_MS / 1000, ease: 'easeInOut', times: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1] },
      },
    },
    drag: {
      y: 0,
      opacity: 1,
      // 拖动保留小幅持续摆动（惯性滞后感），幅度介于 idle 与 hover 之间
      rotate: [0, 3, -3, 1.5, -1.5, 0],
      transition: {
        rotate: {
          duration: 1.6,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.2, 0.4, 0.6, 0.8, 1],
        },
      },
    },
  };
}

/** 物理模式：rotate 由 rAF 弹簧驱动，animate 只管 y/opacity（降落） */
export const physicsBodyVariants: Variants = {
  stopped: STOPPED_VARIANT,
  entrance: {
    y: 0,
    opacity: 1,
    transition: {
      y: { duration: 1.2, ease: 'easeOut' },
      opacity: { duration: 0.6, ease: 'easeOut' },
    },
  },
  idle: { y: 0, opacity: 1 },
  hover: { y: 0, opacity: 1 },
  drag: { y: 0, opacity: 1 },
  pluck: { y: 0, opacity: 1 },
};

export const entranceInitial = { y: -220, opacity: 0 } as const;

/* ==================== Hook ==================== */

export function usePhysicsSwing(
  hovered: boolean,
  dragging: boolean,
  mode: 'physics' | 'classic',
  /** 摆动是否启用（锁定/收起时 false → 停 rAF + 角度归零，省 CPU） */
  enabled: boolean,
  dragDeltaRef?: { current: number },
): {
  state: SwingState;
  landed: boolean;
  pluck: (strength?: 'click' | 'release') => void;
  rotateMV: MotionValue<number>;
  variants: Variants;
} {
  const [landed, setLanded] = useState(false);

  // 经典模式：idle 幅度随机（每次挂载/模式切换重新选）
  const [idleAmp] = useState(() => 1.5 + Math.random() * 1.5);
  const [pluckNonce, setPluckNonce] = useState(0);
  const [plucking, setPlucking] = useState(false);

  // 物理模式：弹簧状态 + 冲量队列
  const rotateMV = useMotionValue(0);
  const impulseRef = useRef(0);
  const hoveredRef = useRef(hovered);
  const draggingRef = useRef(dragging);
  hoveredRef.current = hovered;
  draggingRef.current = dragging;
  // 入场冲量只注入一次（重启 rAF 不重复注入，避免解锁/收起展开后猛摆）
  const startedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setLanded(true), ENTRANCE_MS);
    return () => clearTimeout(timer);
  }, []);

  // 物理 rAF 循环：阻尼弹簧
  useEffect(() => {
    if (mode !== 'physics') return;
    // 锁定/收起：停 rAF、角度归零，摆动完全停止（省 CPU）
    if (!enabled) {
      rotateMV.set(0);
      return;
    }
    let raf = 0;
    let angle = 0;
    let velocity = 0;
    let last = performance.now();
    let lastBreeze = 0;
    // 弹簧参数（统一来自 SWING_PARAMS）
    const K = SWING_PARAMS.K;
    const DAMP_IDLE = 0.3;
    const DAMP_HOVER = SWING_PARAMS.DAMP_HOVER;

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const hov = hoveredRef.current;
      const drg = draggingRef.current;

      if (drg) {
        // 拖动：不禁用物理——窗口平移时便签因惯性滞后摆动。
        // 向右拖(delta>0) → 便签滞后左摆（负角速度）；delta 为每事件位移增量。
        const d = dragDeltaRef?.current ?? 0;
        velocity -= d * SWING_PARAMS.DRAG_LAG_FACTOR;
        // 拖动时阻尼略大，快速稳定但仍保留晃动
        const damping = SWING_PARAMS.DAMP_DRAG;
        velocity += (-K * angle - damping * velocity) * dt;
        angle += velocity * dt;
        // 限制拖拽注入的角速度上限，避免猛甩
        velocity = Math.max(
          -SWING_PARAMS.DRAG_MAX_VELOCITY,
          Math.min(SWING_PARAMS.DRAG_MAX_VELOCITY, velocity),
        );
        // 限幅（弹性反弹，同非拖动分支）
        const MAX = SWING_PARAMS.MAX_ANGLE;
        if (angle > MAX) {
          angle = MAX;
          if (velocity > 0) velocity = -velocity * SWING_PARAMS.BOUNCE_FACTOR;
        } else if (angle < -MAX) {
          angle = -MAX;
          if (velocity < 0) velocity = -velocity * SWING_PARAMS.BOUNCE_FACTOR;
        }
      } else {
        let force = -K * angle;
        if (hov) {
          // 悬停：低频正弦风持续激励，产生约 4~6° 的稳定摆动
          force += Math.sin(now / SWING_PARAMS.HOVER_WIND_PERIOD) * SWING_PARAMS.HOVER_WIND_AMP;
        }
        const damping = hov ? DAMP_HOVER : DAMP_IDLE;
        velocity += (force - damping * velocity) * dt;
        angle += velocity * dt;

        if (!startedRef.current) {
          velocity = SWING_PARAMS.ENTRANCE_VELOCITY; // 入场初始冲量：降落自带约 8° 摆幅
          startedRef.current = true;
        }
        if (impulseRef.current !== 0) {
          velocity += impulseRef.current;
          impulseRef.current = 0;
        }
        // 静止后偶发"微风"：模拟真实风铃的自然扰动（约 3° 摆幅）
        if (
          !hov &&
          Math.abs(angle) < SWING_PARAMS.BREEZE_ANGLE_THRESHOLD &&
          Math.abs(velocity) < SWING_PARAMS.BREEZE_VELOCITY_THRESHOLD
        ) {
          if (now - lastBreeze > SWING_PARAMS.BREEZE_INTERVAL) {
            velocity += (Math.random() * 2 - 1) * SWING_PARAMS.BREEZE_IMPULSE;
            lastBreeze = now;
          }
        }
        // 限幅：到边界做弹性反弹（速度反转并损失能量），避免硬截断导致卡在边界
        const MAX = SWING_PARAMS.MAX_ANGLE;
        if (angle > MAX) {
          angle = MAX;
          if (velocity > 0) velocity = -velocity * SWING_PARAMS.BOUNCE_FACTOR;
        } else if (angle < -MAX) {
          angle = -MAX;
          if (velocity < 0) velocity = -velocity * SWING_PARAMS.BOUNCE_FACTOR;
        }
      }
      rotateMV.set(angle);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [mode, rotateMV, enabled, dragDeltaRef]);

  // P3-2：切回物理模式时重置角度，避免沿用经典模式残余角度造成瞬间跳变
  // （物理 rAF 重启时内部 angle 从 0 开始，但 rotateMV 若保留旧值，首帧会先显示旧角度）
  useEffect(() => {
    if (mode === 'physics') rotateMV.set(0);
  }, [mode, rotateMV]);

  // 经典模式拨动：pluckNonce 变化 → 进入 pluck 状态 → 结束后回 idle
  useEffect(() => {
    if (mode !== 'classic' || pluckNonce === 0) return;
    setPlucking(true);
    const timer = setTimeout(() => setPlucking(false), PLUCK_MS);
    return () => clearTimeout(timer);
  }, [pluckNonce, mode]);

  const pluck = useCallback(
    (strength: 'click' | 'release' = 'click') => {
      if (mode === 'physics') {
        const sign = Math.random() > 0.5 ? 1 : -1;
        // 冲量 = 目标摆幅 × 角频率(ω=√K≈3)：click 约 8~12°，release 约 4~6.5°
        const base =
          strength === 'click'
            ? SWING_PARAMS.PLUCK_CLICK_BASE + Math.random() * SWING_PARAMS.PLUCK_CLICK_RANDOM
            : SWING_PARAMS.PLUCK_RELEASE_BASE + Math.random() * SWING_PARAMS.PLUCK_RELEASE_RANDOM;
        impulseRef.current += sign * base;
      } else {
        setPluckNonce((n) => n + 1);
      }
    },
    [mode],
  );

  const variants = useMemo(
    () => (mode === 'classic' ? buildClassicVariants(idleAmp) : physicsBodyVariants),
    [mode, idleAmp],
  );

  const state = useMemo<SwingState>(() => {
    if (!enabled) return 'stopped';
    if (!landed) return 'entrance';
    if (dragging) return 'drag';
    if (mode === 'classic' && plucking) return 'pluck';
    return hovered ? 'hover' : 'idle';
  }, [enabled, landed, dragging, mode, plucking, hovered]);

  return { state, landed, pluck, rotateMV, variants };
}
