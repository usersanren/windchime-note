import { useState } from 'react';
import { useWidgetStore } from '../../stores/widgetStore';
import { testAiConnection } from '../../services/quoteService';
import { TextField, Toggle } from './ui';

/**
 * 可选的在线 AI 生成配置（OpenAI 兼容接口）。
 * 关闭时完全离线，不产生任何网络请求。
 */
export function AiSettingsSection(): JSX.Element {
  const ai = useWidgetStore((s) => s.ai);
  const setAiConfig = useWidgetStore((s) => s.setAiConfig);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState('');

  const runTest = async (): Promise<void> => {
    if (testState === 'testing') return;
    setTestState('testing');
    setTestMsg('');
    try {
      const sample = await testAiConnection(ai);
      setTestState('ok');
      setTestMsg(`连接成功，示例句：「${sample}」`);
    } catch (err) {
      setTestState('fail');
      setTestMsg(err instanceof Error ? err.message : '连接失败');
    }
  };

  const testColor = testState === 'ok' ? '#3E7A4E' : testState === 'fail' ? '#B25B4E' : '#9A8B6F';

  return (
    <div className="space-y-1.5">
      <Toggle
        checked={ai.enabled}
        onChange={(enabled) => setAiConfig({ enabled })}
        label="启用在线 AI 生成"
      />

      {ai.enabled && (
        <div className="space-y-1.5 pt-0.5">
          <TextField
            value={ai.endpoint}
            onChange={(endpoint) => setAiConfig({ endpoint })}
            placeholder="https://.../v1/chat/completions"
          />
          <TextField
            value={ai.apiKey}
            onChange={(apiKey) => setAiConfig({ apiKey })}
            placeholder="API Key"
            type="password"
          />
          <p className="text-[10px] leading-snug" style={{ color: '#B25B4E' }}>
            ⚠️ Key 明文存储于本机配置文件（无加密），请勿在公用/多用户机器上使用。
          </p>
          <button
            type="button"
            onClick={runTest}
            disabled={testState === 'testing'}
            className="w-full rounded border border-[rgba(139,111,71,0.25)] bg-white/70 px-2 py-1 text-[11px] text-[#4A3728] outline-none transition-colors hover:border-[#8B6F47] disabled:opacity-50"
            style={{ fontFamily: 'system-ui, sans-serif' }}
          >
            {testState === 'testing' ? '测试中…' : '测试连接'}
          </button>
          {testMsg && (
            <p className="text-[10px] leading-snug" style={{ color: testColor }}>
              {testMsg}
            </p>
          )}
          <TextField
            value={ai.model}
            onChange={(model) => setAiConfig({ model })}
            placeholder="模型名，如 gpt-4o-mini"
          />
          <TextField
            value={ai.stylePrompt}
            onChange={(stylePrompt) => setAiConfig({ stylePrompt })}
            placeholder="生成风格（留空 = 词库风格）"
          />
          <p className="text-[10px] leading-snug" style={{ color: '#9A8B6F' }}>
            风格可自定义，如「古风诗意」「极简禅意」「温暖治愈」；留空则按预置词库的励志
            语录风生成。
          </p>
          <p className="text-[10px] leading-snug" style={{ color: '#9A8B6F' }}>
            开启后卡片会多出「AI」按钮，点击即时生成新句子；失败时自动回退到本地句库。
          </p>
          <p className="text-[10px] leading-snug" style={{ color: '#9A8B6F' }}>
            同时开启「每日自动更新」：每天零点自动调 AI 现写新句，存入独立句库（上限一年）；
            生成失败自动回退预置句库，次日跨天仍会再试 AI。
          </p>
        </div>
      )}
    </div>
  );
}
