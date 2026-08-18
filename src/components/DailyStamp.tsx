import { useEffect, useState } from 'react';
import { useWidgetStore } from '../stores/widgetStore';
import { localMonthDay } from '../lib/date';

/** 兜底刷新间隔：60 分钟（用户验证"换句触发刷新"需要长兜底，避免兜底掩盖手动换句的效果） */
const STAMP_FALLBACK_MS = 60 * 60_000;

/**
 * 卡片右下角的红色日期印章：两列竖排「今日寄语」+ 横排日期。
 *
 * 事件驱动刷新（无常驻高频轮询）：
 * 1) 挂载时取一次
 * 2) 跨天换句（lastUpdateDate 变化）时刷新 —— 每日更新开启的主路径
 * 3) 换句信号（quoteVersion 每次换句递增）时刷新 —— 硬机制，无视任何 cache/bail out
 * 4) 窗口 focus / 切回可见时刷新 —— 覆盖手动改系统时间、每日更新关闭等场景
 * 5) 60 分钟兜底 —— 覆盖"完全无人看它"的贴纸/锁定模式
 */
export function DailyStamp(): JSX.Element {
  const [dateLabel, setDateLabel] = useState(localMonthDay);
  // 每日更新开启时，跨天换句会更新 lastUpdateDate → 印章跟着刷新（相同值 React 自动跳过重渲染）
  const lastUpdateDate = useWidgetStore((s) => s.lastUpdateDate);
  // 换句信号（手动刷新 / AI 换句 / 失败回退都会变）：任何换句动作兜底刷新印章，不依赖 markDate 是否传全
  const currentQuoteId = useWidgetStore((s) => s.currentQuoteId);
  const currentQuoteText = useWidgetStore((s) => s.currentQuoteText);
  const currentQuoteSource = useWidgetStore((s) => s.currentQuoteSource);
  // 硬刷新信号：每次换句无条件递增。哪怕前几个字段恰好没变，quoteVersion 必然变化，
  // 触发 effect 重读 Date()。即便 localMonthDay 返回相同值，React 也会正确 bail out（不影响）
  const quoteVersion = useWidgetStore((s) => s.quoteVersion);

  useEffect(() => {
    // 函数式 setState：跨天/换句/手动调时间后，只要日期真变了就更新（相同值 React 自动跳过）
    setDateLabel((prev) => {
      const next = localMonthDay();
      return next === prev ? prev : next;
    });
  }, [lastUpdateDate, currentQuoteId, currentQuoteText, currentQuoteSource, quoteVersion]);

  useEffect(() => {
    const refresh = (): void => setDateLabel(localMonthDay());
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    const fallback = setInterval(() => {
      setDateLabel((prev) => {
        const next = localMonthDay();
        return next === prev ? prev : next;
      });
    }, STAMP_FALLBACK_MS);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(fallback);
    };
  }, []);

  return (
    <div className="daily-stamp stamp-press" aria-label={`今日寄语 ${dateLabel}`}>
      <div className="flex flex-row-reverse gap-[1px]">
        <span className="stamp-vertical">今日</span>
        <span className="stamp-vertical">寄语</span>
      </div>
      <span style={{ fontSize: '10px', lineHeight: 1, marginTop: '3px', letterSpacing: 0 }}>
        {dateLabel}
      </span>
    </div>
  );
}
