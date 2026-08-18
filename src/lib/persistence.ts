/**
 * 配置持久化：Tauri Store Plugin（桌面）/ localStorage（浏览器降级）。
 */
import type { Store } from '@tauri-apps/plugin-store';
import {
  AI_QUOTES_MAX,
  DEFAULT_CONFIG,
  SCALE_LEVELS,
  THEMES,
  type AiQuoteEntry,
  type ScaleLevel,
  type SwingMode,
  type ThemeKey,
  type WidgetConfig,
} from '../types';
import { isTauri } from './tauri';

const STORE_FILE = 'widget-config.json';
const STORE_KEY = 'config';
const LS_KEY = 'desktop-note-widget:config';

let storePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = import('@tauri-apps/plugin-store').then((mod) =>
      mod.load(STORE_FILE, { autoSave: false }),
    );
  }
  return storePromise;
}

/**
 * 浅合并 + ai 子对象深合并，保证新增字段有默认值。
 * 同时做字段级类型校验：配置被手改坏（如 opacity 变字符串、theme 变非法值）时
 * 回退到默认值，避免非法值透传到 UI / Rust 侧。
 */
function mergeConfig(raw: Partial<WidgetConfig> | null | undefined): WidgetConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG };

  const asNum = (v: unknown, fallback: number, min: number, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  const asBool = (v: unknown, fallback: boolean): boolean =>
    typeof v === 'boolean' ? v : fallback;
  const asStr = (v: unknown, fallback: string): string =>
    typeof v === 'string' ? v : fallback;
  const asTheme = (v: unknown): ThemeKey =>
    typeof v === 'string' && v in THEMES ? (v as ThemeKey) : DEFAULT_CONFIG.theme;
  const asScale = (v: unknown): ScaleLevel =>
    SCALE_LEVELS.includes(v as ScaleLevel) ? (v as ScaleLevel) : DEFAULT_CONFIG.scale;
  const asSwing = (v: unknown): SwingMode =>
    v === 'classic' ? 'classic' : DEFAULT_CONFIG.swingMode;
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];

  return {
    ...DEFAULT_CONFIG,
    // x: 旧版本用 -1 表示未初始化 → 迁移为 null；null/undefined 视为未初始化
    position: {
      x: raw.position?.x === -1 || raw.position?.x == null ? null : asNum(raw.position.x, DEFAULT_CONFIG.position.x as number, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      y: asNum(raw.position?.y, DEFAULT_CONFIG.position.y, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    },
    opacity: asNum(raw.opacity, DEFAULT_CONFIG.opacity, 0.3, 1),
    scale: asScale(raw.scale),
    theme: asTheme(raw.theme),
    dailyUpdateEnabled: asBool(raw.dailyUpdateEnabled, DEFAULT_CONFIG.dailyUpdateEnabled),
    autoStartEnabled: asBool(raw.autoStartEnabled, DEFAULT_CONFIG.autoStartEnabled),
    swingMode: asSwing(raw.swingMode),
    fontSize: asNum(raw.fontSize, DEFAULT_CONFIG.fontSize, 12, 28),
    maxLines: asNum(raw.maxLines, DEFAULT_CONFIG.maxLines, 1, 3),
    locked: asBool(raw.locked, DEFAULT_CONFIG.locked),
    lastUpdateDate: asStr(raw.lastUpdateDate, DEFAULT_CONFIG.lastUpdateDate),
    currentQuoteId: asNum(raw.currentQuoteId, DEFAULT_CONFIG.currentQuoteId, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    customQuotes: asStrings(raw.customQuotes),
    currentQuoteSource:
      raw.currentQuoteSource === 'custom' || raw.currentQuoteSource === 'ai'
        ? raw.currentQuoteSource
        : DEFAULT_CONFIG.currentQuoteSource,
    currentQuoteText: asStr(raw.currentQuoteText, DEFAULT_CONFIG.currentQuoteText),
    recentAiQuotes: asStrings(raw.recentAiQuotes).slice(-5),
    // aiQuotes：过滤非法条目 + 钳制上限
    aiQuotes: Array.isArray(raw.aiQuotes)
      ? raw.aiQuotes
          .filter(
            (q): q is AiQuoteEntry =>
              !!q && typeof q === 'object' && typeof q.date === 'string' && typeof q.text === 'string',
          )
          .slice(-AI_QUOTES_MAX)
      : [],
    // 换句计数器（≥0 即可，钳到 0~Number.MAX_SAFE_INTEGER）
    quoteVersion: asNum(raw.quoteVersion, DEFAULT_CONFIG.quoteVersion, 0, Number.MAX_SAFE_INTEGER),
    ai: {
      enabled: asBool(raw.ai?.enabled, DEFAULT_CONFIG.ai.enabled),
      endpoint: asStr(raw.ai?.endpoint, DEFAULT_CONFIG.ai.endpoint),
      apiKey: asStr(raw.ai?.apiKey, DEFAULT_CONFIG.ai.apiKey),
      model: asStr(raw.ai?.model, DEFAULT_CONFIG.ai.model),
      stylePrompt: asStr(raw.ai?.stylePrompt, DEFAULT_CONFIG.ai.stylePrompt),
    },
  };
}

export async function loadConfig(): Promise<WidgetConfig> {
  try {
    if (isTauri()) {
      const store = await getStore();
      const raw = await store.get<Partial<WidgetConfig>>(STORE_KEY);
      return mergeConfig(raw);
    }
    const text = localStorage.getItem(LS_KEY);
    return mergeConfig(text ? (JSON.parse(text) as Partial<WidgetConfig>) : null);
  } catch (err) {
    console.warn('[persistence] load failed, fallback to defaults:', err);
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: WidgetConfig): Promise<void> {
  try {
    if (isTauri()) {
      const store = await getStore();
      await store.set(STORE_KEY, config);
      await store.save();
      return;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('[persistence] save failed:', err);
  }
}

/** 简易防抖，避免拖拽/滑块高频写盘 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
