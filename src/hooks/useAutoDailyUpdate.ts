import { useEffect, useRef } from 'react';
import { useWidgetStore } from '../stores/widgetStore';
import { todayString } from './useQuoteManager';

/** 距离下一个零点的毫秒数（多加 2 秒防止边界抖动） */
function msUntilMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

/**
 * 每日自动更新：
 * 1) 零点定时器触发换句
 * 2) 系统休眠/长时间挂起后靠 60s 轮询兜底比对日期
 */
export function useAutoDailyUpdate(applyDaily: () => void): void {
  const enabled = useWidgetStore((s) => s.dailyUpdateEnabled);
  const lastUpdateDate = useWidgetStore((s) => s.lastUpdateDate);
  const applyRef = useRef(applyDaily);
  const lastDateRef = useRef(lastUpdateDate);

  applyRef.current = applyDaily;
  lastDateRef.current = lastUpdateDate;

  useEffect(() => {
    if (!enabled) return undefined;

    let midnightTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleMidnight = (): void => {
      midnightTimer = setTimeout(() => {
        applyRef.current();
        scheduleMidnight();
      }, msUntilMidnight());
    };
    scheduleMidnight();

    const poll = setInterval(() => {
      if (lastDateRef.current !== todayString()) applyRef.current();
    }, 60_000);

    return () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      clearInterval(poll);
    };
  }, [enabled]);
}
