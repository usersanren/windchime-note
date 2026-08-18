import { useWidgetStore } from '../stores/widgetStore';

interface QuoteTextProps {
  text: string;
  color: string;
  /** 文案变化时重置入场动画 */
  animationKey: string;
}

/** 短句字号档位 */
export const FONT_SIZE_LEVELS = [14, 16, 18, 20, 22] as const;
/** 短句最大显示行数档位 */
export const MAX_LINES_LEVELS = [1, 2, 3] as const;

export function QuoteText({ text, color, animationKey }: QuoteTextProps): JSX.Element {
  const fontSize = useWidgetStore((s) => s.fontSize);
  const maxLines = useWidgetStore((s) => s.maxLines);

  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <p
        key={animationKey}
        className="ink-fade-in m-0 text-center"
        style={{
          color,
          fontSize: `${fontSize}px`,
          lineHeight: 1.8,
          letterSpacing: '0.02em',
          textShadow: '0 1px 0 rgba(255,255,255,0.45)',
          maxWidth: '100%',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
          // 行数截断：超出 maxLines 用省略号收尾（Chromium 标准 line-clamp）
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: maxLines,
          overflow: 'hidden',
        }}
      >
        {text}
      </p>
    </div>
  );
}
