import { AnimatePresence, motion } from 'framer-motion';

interface ControlButtonsProps {
  visible: boolean;
  aiEnabled: boolean;
  aiLoading: boolean;
  onRefresh: () => void;
  onAiRefresh: () => void;
  onLock: () => void;
  onToggleSettings: () => void;
  onCollapse: () => void;
  onClose: () => void;
}

const ICONS = {
  refresh:
    'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  gear:
    'M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z',
  close: 'M18 6 6 18M6 6l12 12',
  lock: 'M19 11H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1ZM7 11V7a5 5 0 0 1 10 0v4',
  collapse: 'M5 3h14M12 21V9M8 13l4-4 4 4',
} as const;

/** 手写记号风：无背景无边框，深棕手绘线条，hover 加深 + 轻微放大 */
function IconButton({
  title,
  onClick,
  disabled = false,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseDown={(e) => e.stopPropagation()}
      className="interactive flex h-8 w-8 items-center justify-center text-[#6B5539] transition-all hover:text-[#3E2F1D] hover:scale-110 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:text-[#6B5539]"
      style={{ willChange: 'transform' }}
    >
      {children}
    </button>
  );
}

/** 悬停时淡入的手写记号按钮组（换一句 / AI / 锁定 / 设置 / 隐藏） */
export function ControlButtons({
  visible,
  aiEnabled,
  aiLoading,
  onRefresh,
  onAiRefresh,
  onLock,
  onToggleSettings,
  onCollapse,
  onClose,
}: ControlButtonsProps): JSX.Element {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="flex items-center justify-center gap-1"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{ willChange: 'transform, opacity' }}
        >
          <IconButton title="换一句" onClick={onRefresh}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS.refresh} />
            </svg>
          </IconButton>

          {aiEnabled && (
            <IconButton title="AI 生成一句" onClick={onAiRefresh} disabled={aiLoading}>
              {aiLoading ? (
                <span className="spin-slow block h-3 w-3 rounded-full border-[2px] border-[#6B5539] border-t-transparent" />
              ) : (
                <span className="text-[12px] font-semibold leading-none tracking-wide">AI</span>
              )}
            </IconButton>
          )}

          <IconButton title="锁定到桌面（托盘解锁）" onClick={onLock}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS.lock} />
            </svg>
          </IconButton>

          <IconButton title="设置" onClick={onToggleSettings}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </IconButton>

          <IconButton title="收起（卷起成顶部小圆点）" onClick={onCollapse}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS.collapse} />
            </svg>
          </IconButton>

          <IconButton title="隐藏（Ctrl+Shift+Q 唤回）" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS.close} />
            </svg>
          </IconButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
