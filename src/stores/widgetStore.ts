import { create } from 'zustand';
import {
  AI_QUOTES_MAX,
  DEFAULT_CONFIG,
  type AiConfig,
  type AiQuoteEntry,
  type QuoteSource,
  type ScaleLevel,
  type SwingMode,
  type ThemeKey,
  type WidgetConfig,
} from '../types';
import { debounce, loadConfig, saveConfig } from '../lib/persistence';
import { localDateString } from '../lib/date';

interface WidgetActions {
  hydrate: () => Promise<void>;
  setPosition: (position: { x: number; y: number }) => void;
  setOpacity: (opacity: number) => void;
  setScale: (scale: ScaleLevel) => void;
  setTheme: (theme: ThemeKey) => void;
  setDailyUpdateEnabled: (enabled: boolean) => void;
  setAutoStartEnabled: (enabled: boolean) => void;
  setSwingMode: (mode: SwingMode) => void;
  setFontSize: (size: number) => void;
  setMaxLines: (lines: number) => void;
  setLocked: (locked: boolean) => void;
  applyQuote: (payload: {
    id: number;
    text: string;
    source: QuoteSource;
    markDate?: boolean;
  }) => void;
  addCustomQuote: (text: string) => void;
  removeCustomQuote: (index: number) => void;
  /** 记录一条 AI 生成历史（去重，上限 5 条，用于防重复 prompt 反例） */
  pushAiQuote: (text: string) => void;
  /** 写入 AI 句库：同日期覆盖，超上限淘汰最旧 */
  addAiQuote: (entry: AiQuoteEntry) => void;
  setAiConfig: (patch: Partial<AiConfig>) => void;
}

export interface WidgetState extends WidgetConfig, WidgetActions {
  hydrated: boolean;
}

const persist = debounce((config: WidgetConfig) => {
  void saveConfig(config);
}, 300);

function snapshot(state: WidgetState): WidgetConfig {
  return {
    position: state.position,
    opacity: state.opacity,
    scale: state.scale,
    theme: state.theme,
    dailyUpdateEnabled: state.dailyUpdateEnabled,
    autoStartEnabled: state.autoStartEnabled,
    swingMode: state.swingMode,
    fontSize: state.fontSize,
    maxLines: state.maxLines,
    locked: state.locked,
    lastUpdateDate: state.lastUpdateDate,
    currentQuoteId: state.currentQuoteId,
    customQuotes: state.customQuotes,
    currentQuoteSource: state.currentQuoteSource,
    currentQuoteText: state.currentQuoteText,
    recentAiQuotes: state.recentAiQuotes,
    aiQuotes: state.aiQuotes,
    quoteVersion: state.quoteVersion,
    ai: state.ai,
  };
}

export const useWidgetStore = create<WidgetState>()((set, get) => {
  const commit = (patch: Partial<WidgetConfig>): void => {
    set(patch as Partial<WidgetState>);
    persist(snapshot(get()));
  };

  return {
    ...DEFAULT_CONFIG,
    hydrated: false,

    hydrate: async () => {
      const config = await loadConfig();
      set({ ...config, hydrated: true });
    },

    setPosition: (position) => commit({ position }),
    setOpacity: (opacity) => commit({ opacity: Math.min(1, Math.max(0.3, opacity)) }),
    setScale: (scale) => commit({ scale }),
    setTheme: (theme) => commit({ theme }),
    setDailyUpdateEnabled: (dailyUpdateEnabled) => commit({ dailyUpdateEnabled }),
    setAutoStartEnabled: (autoStartEnabled) => commit({ autoStartEnabled }),
    setSwingMode: (swingMode) => commit({ swingMode }),
    // 字号钳制 12–28px，非法值（NaN/Infinity）忽略
    setFontSize: (fontSize) => {
      if (!Number.isFinite(fontSize)) return;
      commit({ fontSize: Math.min(28, Math.max(12, Math.round(fontSize))) });
    },
    setMaxLines: (maxLines) => commit({ maxLines }),
    setLocked: (locked) => commit({ locked }),

    applyQuote: ({ id, text, source, markDate }) => {
      const patch: Partial<WidgetConfig> = {
        currentQuoteId: id,
        currentQuoteText: text,
        currentQuoteSource: source,
        // 换句计数器递增：DailyStamp 订阅它无条件重新读 Date()（解决"换句后印章不刷新"边缘场景）
        quoteVersion: get().quoteVersion + 1,
      };
      // 用本地日期（toISOString 是 UTC，GMT+8 凌晨会落后一天导致轮询误判）
      if (markDate) patch.lastUpdateDate = localDateString();
      commit(patch);
    },

    addCustomQuote: (text) => {
      const value = text.trim();
      if (!value) return;
      const list = get().customQuotes;
      if (list.includes(value)) return;
      commit({ customQuotes: [...list, value] });
    },

    removeCustomQuote: (index) => {
      const list = get().customQuotes;
      if (index < 0 || index >= list.length) return;
      commit({ customQuotes: list.filter((_, i) => i !== index) });
    },

    pushAiQuote: (text) => {
      const value = text.trim();
      if (!value) return;
      const list = get().recentAiQuotes;
      if (list.includes(value)) return; // 去重
      commit({ recentAiQuotes: [...list, value].slice(-5) }); // 只保留最近 5 条
    },

    addAiQuote: (entry) => {
      const value = entry.text.trim();
      if (!value) return;
      const list = get().aiQuotes;
      const existing = list.findIndex((q) => q.date === entry.date);
      const next = [...list];
      if (existing >= 0) {
        next[existing] = { date: entry.date, text: value }; // 同日期覆盖（当日重生成）
      } else {
        next.push({ date: entry.date, text: value });
      }
      commit({ aiQuotes: next.slice(-AI_QUOTES_MAX) }); // 上限 366，淘汰最旧
    },

    setAiConfig: (patch) => commit({ ai: { ...get().ai, ...patch } }),
  };
});
