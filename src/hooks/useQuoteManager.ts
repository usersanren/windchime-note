import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWidgetStore } from '../stores/widgetStore';
import {
  PRESET_QUOTES,
  findPresetById,
  pickDailyQuote,
  pickRandomQuote,
  requestAiQuote,
} from '../services/quoteService';
import { localDateString } from '../lib/date';

export const FLIP_HALF_MS = 260;

/** 本地日期 YYYY-MM-DD（与 lib/date 同源，避免 UTC/本地混用） */
export function todayString(): string {
  return localDateString();
}

export interface QuoteManager {
  text: string;
  flipping: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  refreshByAi: () => void;
  applyDaily: () => void;
}

/**
 * 句子管理：
 * - 随机切换：每日更新关闭时，每次启动随机取一条
 * - 手动切换：点击刷新，卡片翻转到 90° 时换文案
 * - 每日更新：按日期确定性选句，同一天保持一致
 */
export function useQuoteManager(): QuoteManager {
  const hydrated = useWidgetStore((s) => s.hydrated);
  const currentQuoteId = useWidgetStore((s) => s.currentQuoteId);
  const currentQuoteText = useWidgetStore((s) => s.currentQuoteText);
  const currentQuoteSource = useWidgetStore((s) => s.currentQuoteSource);
  const customQuotes = useWidgetStore((s) => s.customQuotes);
  const dailyUpdateEnabled = useWidgetStore((s) => s.dailyUpdateEnabled);
  const lastUpdateDate = useWidgetStore((s) => s.lastUpdateDate);
  const ai = useWidgetStore((s) => s.ai);
  const applyQuote = useWidgetStore((s) => s.applyQuote);
  const recentAiQuotes = useWidgetStore((s) => s.recentAiQuotes);
  const pushAiQuote = useWidgetStore((s) => s.pushAiQuote);
  const aiQuotes = useWidgetStore((s) => s.aiQuotes);
  const addAiQuote = useWidgetStore((s) => s.addAiQuote);

  const [flipping, setFlipping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const text = useMemo(() => {
    if (currentQuoteSource === 'preset') {
      return findPresetById(currentQuoteId)?.text ?? (currentQuoteText || PRESET_QUOTES[0].text);
    }
    return currentQuoteText || PRESET_QUOTES[0].text;
  }, [currentQuoteId, currentQuoteText, currentQuoteSource]);

  /** 翻转到中点时替换文案，避免文字突兀跳变 */
  const flipTo = useCallback(
    (next: { id: number; text: string; source: 'preset' | 'custom' | 'ai' }, markDate: boolean) => {
      setFlipping(true);
      const timer = setTimeout(() => {
        applyQuote({ ...next, markDate });
        setFlipping(false);
      }, FLIP_HALF_MS);
      timersRef.current.push(timer);
    },
    [applyQuote],
  );

  const refresh = useCallback(() => {
    setError(null);
    // markDate: true —— 手动换句视为"今日句"，更新 lastUpdateDate 让印章/每日更新判定同步
    flipTo(pickRandomQuote(currentQuoteId, customQuotes), true);
  }, [flipTo, currentQuoteId, customQuotes]);

  /**
   * 调 AI 生成今日句并落地：
   * - 写入 AI 句库（addAiQuote）+ 记防重复历史（pushAiQuote）
   * - flip=true 走翻面动画（零点定时器触发）；flip=false 直接替换（启动引导，避免入场动画叠加翻面）
   * - 返回是否成功，失败由调用方决定回退策略
   */
  const fetchAndApplyAi = useCallback(
    async (today: string, flip: boolean): Promise<boolean> => {
      // 防重复：最近历史 + AI 句库最近 7 条作 prompt 反例
      const history = Array.from(
        new Set([...recentAiQuotes, ...aiQuotes.slice(-7).map((q) => q.text)]),
      );
      setLoading(true);
      try {
        const quote = await requestAiQuote(ai, history);
        addAiQuote({ date: today, text: quote.text });
        pushAiQuote(quote.text);
        if (flip) {
          flipTo(quote, true);
        } else {
          applyQuote({ ...quote, markDate: true });
        }
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI 生成失败';
        setError(message);
        const timer = setTimeout(() => setError(null), 4000);
        timersRef.current.push(timer);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [ai, recentAiQuotes, aiQuotes, addAiQuote, pushAiQuote, flipTo, applyQuote],
  );

  const applyDaily = useCallback(() => {
    setError(null);
    const today = todayString();
    if (ai.enabled) {
      // 库里有今日 AI 句 → 直接展示（同日一致性，不重复调接口）
      const todayEntry = aiQuotes.find((q) => q.date === today);
      if (todayEntry) {
        flipTo({ id: -1, text: todayEntry.text, source: 'ai' }, true);
        return;
      }
      // 跨天：调 AI 现写；失败回退预置池（下次跨天仍会再试 AI）
      void fetchAndApplyAi(today, true).then((ok) => {
        if (!ok) flipTo(pickDailyQuote(today, customQuotes), true);
      });
      return;
    }
    flipTo(pickDailyQuote(today, customQuotes), true);
  }, [ai.enabled, aiQuotes, customQuotes, flipTo, fetchAndApplyAi]);

  const refreshByAi = useCallback(() => {
    setError(null);
    setLoading(true);
    // 防重复：最近历史 + AI 句库最近 7 条作反例传进 prompt（源头上避开）
    const history = Array.from(
      new Set([...recentAiQuotes, ...aiQuotes.slice(-7).map((q) => q.text)]),
    );
    // attempt(网络失败重试次数, 撞车重试次数)
    const attempt = (failRetries: number, dupRetries: number): void => {
      void requestAiQuote(ai, history)
        .then((quote) => {
          // 与当前展示文本相同（撞车）→ 最多再生成 1 次
          if (quote.text === currentQuoteText && dupRetries < 1) {
            attempt(0, dupRetries + 1);
            return;
          }
          // 与最近历史 / AI 句库任一相同（罕见）→ 也重试 1 次
          if (
            (recentAiQuotes.includes(quote.text) || aiQuotes.some((q) => q.text === quote.text)) &&
            dupRetries < 1
          ) {
            attempt(0, dupRetries + 1);
            return;
          }
          pushAiQuote(quote.text); // 记录防重复历史（store 内去重、上限 5）
          addAiQuote({ date: todayString(), text: quote.text }); // 手动生成同样入库
          // markDate: true —— AI 换句也视为"今日句"，印章同步刷新
          flipTo(quote, true);
        })
        .catch((err: unknown) => {
          // P1-4：网络/接口失败自动重试 1 次
          if (failRetries < 1) {
            attempt(failRetries + 1, dupRetries);
            return;
          }
          const message = err instanceof Error ? err.message : 'AI 生成失败';
          setError(message);
          // Toast 报错 4s 后自动消失（避免常驻遮挡）
          const timer = setTimeout(() => setError(null), 4000);
          timersRef.current.push(timer);
          // AI 失败回退库句：同样视为"今日句"，markDate: true 保持印章一致
          flipTo(pickRandomQuote(currentQuoteId, customQuotes), true);
        })
        .finally(() => setLoading(false));
    };
    attempt(0, 0);
  }, [ai, flipTo, currentQuoteId, customQuotes, currentQuoteText, recentAiQuotes, aiQuotes, pushAiQuote, addAiQuote]);

  // 启动引导：每日模式看日期，否则随机
  useEffect(() => {
    if (!hydrated || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const today = todayString();
    if (dailyUpdateEnabled) {
      if (lastUpdateDate !== today) {
        if (ai.enabled) {
          // AI 开启：库里有今日句 → 直接展示；否则先预置句占位（保证首屏有内容），再异步调 AI 替换
          const todayEntry = aiQuotes.find((q) => q.date === today);
          if (todayEntry) {
            applyQuote({ id: -1, text: todayEntry.text, source: 'ai', markDate: true });
          } else {
            applyQuote({ ...pickDailyQuote(today, customQuotes), markDate: true });
            void fetchAndApplyAi(today, false);
          }
        } else {
          applyQuote({ ...pickDailyQuote(today, customQuotes), markDate: true });
        }
      }
      return;
    }
    applyQuote({ ...pickRandomQuote(currentQuoteId, customQuotes), markDate: false });
  }, [hydrated, dailyUpdateEnabled, lastUpdateDate, customQuotes, currentQuoteId, applyQuote, ai.enabled, aiQuotes, fetchAndApplyAi]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  return { text, flipping, loading, error, refresh, refreshByAi, applyDaily };
}
