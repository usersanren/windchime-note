import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { ThemePalette } from '../types';
import { QuoteText } from './QuoteText';
import { DailyStamp } from './DailyStamp';

export const CARD_SIZE = { width: 400, height: 220 } as const;

interface NoteCardProps {
  palette: ThemePalette;
  text: string;
  flipping: boolean;
  /** 拖拽起点；锁定（贴纸模式）时为 undefined 以禁用拖拽 */
  onMouseDown?: (event: React.MouseEvent) => void;
  /** 点击便签纸本体（用于收起设置面板等；拖动不触发） */
  onClick?: () => void;
  /** P3-7 双击便签纸：快捷打开设置 */
  onDoubleClick?: () => void;
}

/** 便签纸本体：纸张纹理 + 手绘边框 + 卷角 + 穿绳孔 + 翻转动画 */
export function NoteCard({
  palette,
  text,
  flipping,
  onMouseDown,
  onClick,
  onDoubleClick,
}: NoteCardProps): JSX.Element {
  const cardStyle: CSSProperties = {
    width: CARD_SIZE.width,
    height: CARD_SIZE.height,
    ['--paper-color' as string]: palette.paper,
    ['--paper-fold' as string]: palette.paperFold,
    ['--paper-border' as string]: palette.border,
    cursor: 'grab',
    willChange: 'transform',
  };

  return (
    <div style={{ perspective: 900 }}>
      <motion.div
        className="note-card paper-texture interactive"
        style={cardStyle}
        onMouseDown={onMouseDown}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        animate={{ rotateY: flipping ? 90 : 0 }}
        transition={{ duration: 0.26, ease: 'easeInOut' }}
      >
        <div className="note-hole absolute left-1/2 top-[10px] -translate-x-1/2" />

        <div className="absolute inset-0 pt-8 pb-10">
          <QuoteText text={text} color={palette.ink} animationKey={text} />
        </div>

        <div className="absolute bottom-[30px] right-[18px] z-10">
          <DailyStamp />
        </div>
      </motion.div>
    </div>
  );
}
