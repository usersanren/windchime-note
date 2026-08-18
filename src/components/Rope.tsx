import { motion } from 'framer-motion';

/** 绳结小球尺寸（rope-knot 12px）与重叠量（-mt-[2px]） */
const KNOT_SIZE = 12;
const KNOT_OVERLAP = 2;

/**
 * Rope 组件实际占用总高 = 绳子 height + 绳结 12 - 重叠 2。
 * 布局计算（卡片底、撕边线、按钮区）必须用它，不要直接用 ROPE_HEIGHT。
 */
export function ropeTotalHeight(ropeHeight: number): number {
  return ropeHeight + KNOT_SIZE - KNOT_OVERLAP;
}

interface RopeProps {
  /** 绳子长度（px），入场时由 0 伸长到该值 */
  height: number;
  landed: boolean;
}

/** 从窗口顶部垂下的麻绳 + 底部绳结 */
export function Rope({ height, landed }: RopeProps): JSX.Element {
  return (
    <div className="flex flex-col items-center" style={{ willChange: 'transform' }}>
      <motion.div
        className="rope rope-breathe"
        initial={{ height: 0 }}
        animate={{ height }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        style={{ willChange: 'transform, height' }}
      />
      <motion.div
        className="rope-knot -mt-[2px]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: landed ? 1 : 0.6, opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.4, ease: 'backOut' }}
        style={{ willChange: 'transform' }}
      />
    </div>
  );
}
