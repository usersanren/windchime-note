/** 主题标识 */
export type ThemeKey = 'warm' | 'pink' | 'green' | 'kraft';

/** 缩放档位 */
export type ScaleLevel = 0.6 | 0.8 | 1.0 | 1.2;

/** 摆动效果：physics = 真实物理阻尼（默认），classic = 经典关键帧摆动 */
export type SwingMode = 'physics' | 'classic';

/** 预置短句结构 */
export interface Quote {
  id: number;
  text: string;
  category: string;
}

/** 在线 AI 生成配置（可选能力，留空则完全离线） */
export interface AiConfig {
  enabled: boolean;
  /** OpenAI 兼容的 chat/completions 端点 */
  endpoint: string;
  apiKey: string;
  model: string;
  /** 生成风格描述（自然语言，如"简短励志语录风"）；留空 = 使用词库风格 */
  stylePrompt: string;
}

/** 持久化到 Tauri Store 的完整配置 */
export interface WidgetConfig {
  /** x = null 表示「从未拖拽过」（首次运行）；副屏可为负值（虚拟桌面坐标） */
  position: { x: number | null; y: number };
  opacity: number;
  scale: ScaleLevel;
  theme: ThemeKey;
  dailyUpdateEnabled: boolean;
  autoStartEnabled: boolean;
  /** 摆动效果：physics（物理阻尼，默认）/ classic（经典关键帧） */
  swingMode: SwingMode;
  /** 短句字号（px，档位 14/16/18/20/22） */
  fontSize: number;
  /** 短句最大显示行数（1/2/3，超出用省略号截断） */
  maxLines: number;
  /** 锁定到桌面：整窗鼠标穿透，便签不可交互（贴纸模式） */
  locked: boolean;
  /** 形如 "2026-08-09" */
  lastUpdateDate: string;
  currentQuoteId: number;
  customQuotes: string[];
  /** 当前展示的句子来源：预置池 / 自定义 / AI */
  currentQuoteSource: QuoteSource;
  /** 当来源不是预置池时，直接缓存文本 */
  currentQuoteText: string;
  /** 最近 AI 生成的历史句子（最多 5 条，防重复 + 可作为 prompt 反例） */
  recentAiQuotes: string[];
  /** AI 句库：按日期存储每日 AI 生成句（独立于预置池，上限 AI_QUOTES_MAX） */
  aiQuotes: AiQuoteEntry[];
  /** 每次换句递增的计数器：DailyStamp 订阅它强制重新读 Date()（解决"换句后印章不刷新"边缘场景） */
  quoteVersion: number;
  ai: AiConfig;
}

export type QuoteSource = 'preset' | 'custom' | 'ai';

/** AI 句库条目：date 为本地日期（YYYY-MM-DD，与 lib/date 同源） */
export interface AiQuoteEntry {
  date: string;
  text: string;
}

/** AI 句库容量上限（366 = 一年），超出淘汰最旧 */
export const AI_QUOTES_MAX = 366;

/** 主题配色定义 */
export interface ThemePalette {
  key: ThemeKey;
  label: string;
  paper: string;
  paperFold: string;
  ink: string;
  border: string;
}

export const THEMES: Record<ThemeKey, ThemePalette> = {
  warm: {
    key: 'warm',
    label: '暖黄',
    paper: '#FDF6E3',
    paperFold: '#F0E6D2',
    ink: '#4A3728',
    border: 'rgba(139,111,71,0.15)',
  },
  pink: {
    key: 'pink',
    label: '淡粉',
    paper: '#FFF0F5',
    paperFold: '#F5DCE5',
    ink: '#5A3A45',
    border: 'rgba(180,120,140,0.18)',
  },
  green: {
    key: 'green',
    label: '浅绿',
    paper: '#F0FFF4',
    paperFold: '#D9EFE0',
    ink: '#2F4A38',
    border: 'rgba(90,140,110,0.18)',
  },
  kraft: {
    key: 'kraft',
    label: '牛皮纸',
    paper: '#DEB887',
    paperFold: '#C9A374',
    ink: '#3B2A18',
    border: 'rgba(90,64,36,0.25)',
  },
};

export const SCALE_LEVELS: ScaleLevel[] = [0.6, 0.8, 1.0, 1.2];

/** 未缩放时的窗口逻辑尺寸 */
export const BASE_WINDOW = { width: 520, height: 520 } as const;

export const DEFAULT_CONFIG: WidgetConfig = {
  position: { x: null, y: 0 },
  opacity: 1,
  scale: 1.0,
  theme: 'warm',
  dailyUpdateEnabled: true,
  autoStartEnabled: false,
  swingMode: 'physics',
  fontSize: 18,
  maxLines: 2,
  locked: false,
  lastUpdateDate: '',
  currentQuoteId: 1,
  customQuotes: [],
  currentQuoteSource: 'preset',
  currentQuoteText: '',
  recentAiQuotes: [],
  aiQuotes: [],
  quoteVersion: 0,
  ai: {
    enabled: false,
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    model: 'gpt-4o-mini',
    stylePrompt: '',
  },
};
