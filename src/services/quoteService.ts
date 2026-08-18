/**
 * 句子服务：本地预置池（默认）+ 用户自定义句子 + 可选在线 AI 生成。
 */
import { invoke } from '@tauri-apps/api/core';
import presetQuotes from '../data/quotes.json';
import type { AiConfig, Quote, QuoteSource } from '../types';
import { isTauri } from '../lib/tauri';

export const PRESET_QUOTES = presetQuotes as Quote[];

export interface ResolvedQuote {
  id: number;
  text: string;
  source: QuoteSource;
}

/** 自定义句子使用负数 id，避免与预置池冲突 */
const CUSTOM_ID_BASE = -1000;

export function customIndexToId(index: number): number {
  return CUSTOM_ID_BASE - index;
}

export function idToCustomIndex(id: number): number {
  return CUSTOM_ID_BASE - id;
}

export function findPresetById(id: number): Quote | undefined {
  return PRESET_QUOTES.find((q) => q.id === id);
}

/**
 * 从「预置池 + 自定义句子」中随机取一条，尽量避开当前这条。
 * 自定义句子与预置池共同参与随机，权重相同。
 */
export function pickRandomQuote(currentId: number, customQuotes: string[]): ResolvedQuote {
  const pool: ResolvedQuote[] = PRESET_QUOTES.map((q) => ({
    id: q.id,
    text: q.text,
    source: 'preset' as const,
  }));
  customQuotes.forEach((text, index) => {
    pool.push({ id: customIndexToId(index), text, source: 'custom' });
  });

  const candidates = pool.length > 1 ? pool.filter((q) => q.id !== currentId) : pool;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  return picked ?? { id: PRESET_QUOTES[0].id, text: PRESET_QUOTES[0].text, source: 'preset' };
}

/** 按日期做确定性选取，保证同一天多次启动展示同一句 */
export function pickDailyQuote(dateStr: string, customQuotes: string[]): ResolvedQuote {
  const pool: ResolvedQuote[] = PRESET_QUOTES.map((q) => ({
    id: q.id,
    text: q.text,
    source: 'preset' as const,
  }));
  customQuotes.forEach((text, index) => {
    pool.push({ id: customIndexToId(index), text, source: 'custom' });
  });
  let hash = 0;
  for (let i = 0; i < dateStr.length; i += 1) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) % 1000000007;
  }
  const picked = pool[hash % pool.length];
  return picked ?? { id: PRESET_QUOTES[0].id, text: PRESET_QUOTES[0].text, source: 'preset' };
}

/**
 * AI 短句生成的 prompt 基础模板（与 Rust 侧保持一致）。
 * 默认风格 = 词库风格（口语化励志语录：有因果/转折逻辑，不诗意化）。
 * ⚠️ 不使用 stop 序列——agnet 等推理模型会把 stop 立刻命中导致 completion_tokens=1 + content=""
 */
export const AI_PROMPT =
  '你是朋友圈励志语录作者。写一句中文励志短句，15-25 字（含标点）。' +
  '风格：口语化、温暖有力，像普通人分享坚持心得，有因果或转折逻辑（如"熬过…才配拥有…"、"与其…不如…"）。' +
  '不要诗歌化、不要华丽比喻、不要意象描写。' +
  '要求：不含引号、不含编号、不含解释、不重复任何提示。直接输出句子本体。';

/**
 * 随机句式结构池：既保证每次请求 payload 不同（绕过平台缓存），
 * 又贴合词库语感（因果/转折/让步等口语化逻辑结构）。
 */
const RANDOM_STRUCTURES = [
  '用"熬过…才配拥有…"的因果句式展开',
  '用"与其…不如…"的选择句式展开',
  '用"别怕…终会…"的转折句式展开',
  '用"今天…明天…"的对比句式展开',
  '用"每一次…都在…"的递进句式展开',
  '用"慢慢来，但…"的让步句式展开',
  '用"时光不会辜负…"的肯定句式展开',
  '用"种下…终会…"的因果句式展开',
  '用"真正的…不是…而是…"的转折句式展开',
  '用"再远的路，只要…"的条件句式展开',
  '用"把…做到极致…"的递进句式展开',
  '用"你现在的…是将来…"的因果句式展开',
];

/**
 * 生成完整 prompt：
 * - stylePrompt 非空 → 用户自定义风格（覆盖默认词库风格描述）
 * - stylePrompt 为空 → 词库风格（AI_PROMPT 模板）
 * - recentQuotes 非空 → 附上最近生成的历史句子作为反例，要求模型避开（防重复）
 * 每次追加随机句式结构，保证 payload 不同 → 平台缓存 miss → 真正调用模型。
 */
function buildAiPrompt(stylePrompt: string, recentQuotes: string[]): string {
  const structure = RANDOM_STRUCTURES[Math.floor(Math.random() * RANDOM_STRUCTURES.length)];
  const styleText = stylePrompt.trim()
    ? `你是便签纸上的短句创作人。写一句中文短句，15-25 字（含标点）。风格要求：${stylePrompt.trim()}。要求：不含引号、不含编号、不含解释、不重复任何提示。直接输出句子本体。`
    : AI_PROMPT;
  const antiDup = recentQuotes.length
    ? `\n已生成过以下句子，请务必避开，不要与它们相同或高度相似：\n${recentQuotes.join('\n')}`
    : '';
  return `${styleText}${antiDup}\n本次${structure}。`;
}

/** sanitize 时剔除的 prompt 关键词（出现这些词的行视为 prompt 泄漏，整行丢弃） */
const PROMPT_LEAK_PATTERNS = /用户要求|用户|prompt|示例|请写|不要|要求|18|22/;

/**
 * 清洗 AI 原始输出：
 * 1) 按行切，只保留首行非空行（防止模型多行吐字）
 * 2) 剔除首尾引号/空白/数字编号
 * 3) 若首行包含 prompt 关键词（用户/要求/示例等）→ 视为 prompt 泄漏，整行丢弃
 * 4) 限制长度 30 字（中文约 15-22 个字短句）
 */
function sanitize(raw: string): string {
  const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    const stripped = line
      .replace(/^["'「『“”\s]+|["'」』“”\s]+$/g, '')
      .replace(/^\d+[.、)]\s*/, '');
    // 含 prompt 关键词 → 视为泄漏，整行丢弃换下一行
    if (PROMPT_LEAK_PATTERNS.test(stripped)) continue;
    return [...stripped].slice(0, 30).join('');
  }
  return '';
}

/**
 * 把 OpenAI 兼容接口的 HTTP 状态码映射为「用户可行动的配置诊断」，
 * 让用户一眼知道是 Key / endpoint / 模型名哪个填错了。
 */
function describeHttpError(status: number, detail: string): string {
  let base: string;
  switch (status) {
    case 401:
    case 403:
      base = 'API Key 无效或未授权，请检查填写的 Key';
      break;
    case 404:
      base = '接口地址错误，请检查 endpoint（OpenAI 兼容的 /chat/completions 地址）';
      break;
    case 400:
      base = '请求参数有误（常见原因：模型名不存在），请检查 model';
      break;
    case 429:
      base = '请求过于频繁（限流），请稍后再试';
      break;
    default:
      base = status >= 500 ? 'AI 服务端暂时不可用，请稍后再试' : `接口返回异常状态码 ${status}`;
  }
  return detail ? `${base}（${detail}）` : base;
}

/** 从 OpenAI 兼容错误响应体中提取 error.message */
async function extractErrorDetail(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message?.trim() ?? '';
  } catch {
    return '';
  }
}

/**
 * 归一化 endpoint：用户常只填 base（如 .../v1），但请求必须打到 /chat/completions。
 * 自动补全后缀，兼容「填 base」与「填完整路径」两种写法。
 */
export function normalizeEndpoint(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, ''); // 去尾部斜杠
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

/**
 * 调用 OpenAI 兼容接口生成句子。
 * 桌面端走 Rust 侧 reqwest（规避 CORS），浏览器端直接 fetch。
 * @param recentQuotes 最近生成的历史句子（作 prompt 反例，防重复）
 */
export async function requestAiQuote(
  ai: AiConfig,
  recentQuotes: string[] = [],
): Promise<ResolvedQuote> {
  if (!ai.enabled) throw new Error('AI 生成未启用');
  if (!ai.apiKey.trim()) throw new Error('请先填写 API Key');
  if (!ai.endpoint.trim()) throw new Error('请先填写接口地址');

  // 自动补全 /chat/completions 后缀（兼容填 base 或完整路径）
  const endpoint = normalizeEndpoint(ai.endpoint);
  const model = ai.model.trim() || 'gpt-4o-mini';
  // 每次请求用不同的随机句式结构：打破平台缓存 / 模型确定性，保证每次都真实调用
  // 风格：stylePrompt 非空用自定义，空用词库默认风格；recentQuotes 作为反例防重复
  const prompt = buildAiPrompt(ai.stylePrompt, recentQuotes);

  let content: string;
  if (isTauri()) {
    content = await invoke<string>('generate_ai_quote', {
      endpoint,
      apiKey: ai.apiKey.trim(),
      model,
      prompt,
    });
  } else {
    // P1-4：浏览器降级路径加 30s 超时（与 Rust 侧一致），防止请求悬挂
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ai.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          // 1.5：高创造性（OpenAI 兼容范围 0–2），用户选择的上限档位
          temperature: 1.5,
          // 2048：推理模型思考过程耗 token 大（同 Rust 侧）
          max_tokens: 2048,
          // ⚠️ 不传 stop：agnet 推理模型会把 stop 立刻命中 → completion_tokens=1 → content 空
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await extractErrorDetail(res);
        throw new Error(describeHttpError(res.status, detail));
      }
      // 先拿原文，解析失败时把响应片段带进错误，便于定位格式问题
      const bodyText = await res.text();
      let data: {
        choices?: Array<{
          message?: {
            content?: string | Array<{ text?: string }>;
            reasoning_content?: string;
          };
          text?: string;
        }>;
      };
      try {
        data = JSON.parse(bodyText);
      } catch {
        throw new Error(
          `响应不是 JSON（原始响应前 300 字符：${bodyText.slice(0, 300)})`,
        );
      }
      // 兼容：字符串 / 数组 / reasoning_content / choices[0].text 兜底
      const raw = data.choices?.[0];
      let extracted = '';
      if (typeof raw?.message?.content === 'string') {
        extracted = raw.message.content;
      } else if (Array.isArray(raw?.message?.content)) {
        extracted = raw.message.content.map((p) => p.text ?? '').join('');
      } else {
        extracted = raw?.message?.reasoning_content ?? raw?.text ?? '';
      }
      if (!extracted.trim()) {
        // 提取失败：附上响应原文，方便用户反馈真实格式
        throw new Error(`无法从响应中解析出句子（原始响应：${bodyText.slice(0, 300)})`);
      }
      content = extracted;
    } finally {
      clearTimeout(timer);
    }
  }

  const text = sanitize(content);
  if (!text) throw new Error('AI 未返回有效内容');
  return { id: -1, text, source: 'ai' };
}

/**
 * 测试 AI 连接：验证 endpoint + Key 是否可用。
 * 复用 requestAiQuote 的完整链路（归一化 / 错误诊断 / 超时 / 解析兜底），
 * 但只返回连接结果，不写句库、不切换当前句子。
 * @returns 成功时返回测试用的示例句（可直接展示），失败抛错（带中文诊断）。
 */
export async function testAiConnection(ai: AiConfig): Promise<string> {
  const quote = await requestAiQuote(ai, []);
  return quote.text;
}
