import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SCALE_LEVELS, THEMES, type ScaleLevel, type SwingMode, type ThemeKey } from '../types';
import { FONT_SIZE_LEVELS, MAX_LINES_LEVELS } from './QuoteText';
import { useWidgetStore } from '../stores/widgetStore';
import { setAutoStart } from '../lib/tauri';
import { Section, Toggle } from './settings/ui';
import { AiSettingsSection } from './settings/AiSettingsSection';
import { CustomQuotesEditor } from './settings/CustomQuotesEditor';
import pkg from '../../package.json';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

/** 从卡片右侧滑出的设置抽屉 */
export function SettingsPanel({ open, onClose }: SettingsPanelProps): JSX.Element {
  const opacity = useWidgetStore((s) => s.opacity);
  const scale = useWidgetStore((s) => s.scale);
  const theme = useWidgetStore((s) => s.theme);
  const dailyUpdateEnabled = useWidgetStore((s) => s.dailyUpdateEnabled);
  const autoStartEnabled = useWidgetStore((s) => s.autoStartEnabled);
  const swingMode = useWidgetStore((s) => s.swingMode);
  const fontSize = useWidgetStore((s) => s.fontSize);
  const maxLines = useWidgetStore((s) => s.maxLines);
  const setOpacity = useWidgetStore((s) => s.setOpacity);
  const setScale = useWidgetStore((s) => s.setScale);
  const setTheme = useWidgetStore((s) => s.setTheme);
  const setDailyUpdateEnabled = useWidgetStore((s) => s.setDailyUpdateEnabled);
  const setAutoStartEnabled = useWidgetStore((s) => s.setAutoStartEnabled);
  const setSwingMode = useWidgetStore((s) => s.setSwingMode);
  const setFontSize = useWidgetStore((s) => s.setFontSize);
  const setMaxLines = useWidgetStore((s) => s.setMaxLines);

  const handleAutoStart = (next: boolean): void => {
    setAutoStartEnabled(next);
    void setAutoStart(next).then((actual) => {
      if (actual !== next) setAutoStartEnabled(actual);
    });
  };

  // P0-1 修复：自定义字号用「本地草稿 + 失焦/回车提交」，避免受控输入被即时钳制打断
  const [fontSizeDraft, setFontSizeDraft] = useState(String(fontSize));
  useEffect(() => {
    setFontSizeDraft(String(fontSize));
  }, [fontSize]);

  const commitFontSize = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed === '') return; // 空输入忽略，保留当前值
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return; // 非法输入忽略
    setFontSize(n);
    setFontSizeDraft(String(n)); // 提交后同步显示（含钳制后的值）
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="interactive fixed right-[2px] top-[92px] z-50 flex max-h-[calc(100vh-130px)] w-[220px] flex-col rounded-lg border border-[rgba(139,111,71,0.22)] bg-[rgba(253,246,227,0.97)] shadow-lg backdrop-blur-sm"
          initial={{ x: 224, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 224, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          style={{ willChange: 'transform, opacity', fontFamily: 'system-ui, sans-serif' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="flex items-center justify-between border-b border-[rgba(139,111,71,0.15)] px-3 py-2">
            <span className="text-[12px] font-semibold text-[#4A3728]">设置</span>
            <button
              type="button"
              onClick={onClose}
              className="text-[14px] leading-none text-[#8B6F47] hover:text-[#5E4A2E]"
            >
              ×
            </button>
          </header>

          {/* 内容区：超出高度滚动；footer 固定在底部始终可见 */}
          <div className="thin-scroll flex-1 overflow-y-auto">
            <Section title={`透明度 ${Math.round(opacity * 100)}%`}>
              <input
                type="range"
                min={30}
                max={100}
                step={1}
                value={Math.round(opacity * 100)}
                onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                className="w-full"
              />
            </Section>

            <Section title="大小">
              <div className="grid grid-cols-4 gap-1">
                {SCALE_LEVELS.map((level: ScaleLevel) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setScale(level)}
                    className={`rounded border px-1 py-1 text-[11px] transition-colors ${
                      scale === level
                        ? 'border-[#8B6F47] bg-[#8B6F47] text-white'
                        : 'border-[rgba(139,111,71,0.25)] bg-white/60 text-[#4A3728] hover:bg-white'
                    }`}
                  >
                    {Math.round(level * 100)}%
                  </button>
                ))}
              </div>
            </Section>

            <Section title="字体">
              <div className="grid grid-cols-5 gap-1">
                {FONT_SIZE_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setFontSize(level)}
                    className={`rounded border px-1 py-1 text-[11px] transition-colors ${
                      fontSize === level
                        ? 'border-[#8B6F47] bg-[#8B6F47] text-white'
                        : 'border-[rgba(139,111,71,0.25)] bg-white/60 text-[#4A3728] hover:bg-white'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
              {/* 自定义字号：本地草稿，失焦/回车提交，提交时 store 层钳制 12–28 */}
              <div className="mt-1.5 flex items-center gap-1.5">
                <label className="shrink-0 text-[10px] text-[#9A8B6F]">自定义</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={fontSizeDraft}
                  onChange={(e) => setFontSizeDraft(e.target.value)}
                  onBlur={(e) => commitFontSize(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="w-full rounded border border-[rgba(139,111,71,0.25)] bg-white/60 px-1.5 py-0.5 text-[11px] text-[#4A3728] outline-none focus:border-[#8B6F47]"
                />
                <span className="shrink-0 text-[9px] text-[#B5A68A]">px</span>
              </div>
            </Section>

            <Section title="显示行数">
              <div className="grid grid-cols-3 gap-1">
                {MAX_LINES_LEVELS.map((lines) => (
                  <button
                    key={lines}
                    type="button"
                    onClick={() => setMaxLines(lines)}
                    className={`rounded border px-1 py-1 text-[11px] transition-colors ${
                      maxLines === lines
                        ? 'border-[#8B6F47] bg-[#8B6F47] text-white'
                        : 'border-[rgba(139,111,71,0.25)] bg-white/60 text-[#4A3728] hover:bg-white'
                    }`}
                  >
                    {lines} 行
                  </button>
                ))}
              </div>
            </Section>

            <Section title="主题">
              <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(THEMES) as ThemeKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    title={THEMES[key].label}
                    onClick={() => setTheme(key)}
                    className={`h-7 rounded border-2 transition-transform active:scale-95 ${
                      theme === key ? 'border-[#8B6F47]' : 'border-[rgba(139,111,71,0.2)]'
                    }`}
                    style={{ background: THEMES[key].paper, willChange: 'transform' }}
                  />
                ))}
              </div>
            </Section>

          <Section title="行为">
            <div className="space-y-2">
              <Toggle
                checked={dailyUpdateEnabled}
                onChange={setDailyUpdateEnabled}
                label="每日自动更新"
              />
              <Toggle checked={autoStartEnabled} onChange={handleAutoStart} label="开机自动启动" />
              <div>
                <div className="mb-1 text-[10px] text-[#9A8B6F]">摆动效果</div>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { value: 'physics', label: '物理摆动' },
                      { value: 'classic', label: '经典摆动' },
                    ] as { value: SwingMode; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setSwingMode(item.value)}
                      className={`rounded border px-1 py-1 text-[11px] transition-colors ${
                        swingMode === item.value
                          ? 'border-[#8B6F47] bg-[#8B6F47] text-white'
                          : 'border-[rgba(139,111,71,0.25)] bg-white/60 text-[#4A3728] hover:bg-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[9px] leading-snug text-[#B5A68A]">
                  物理：自然衰减，点击/拖拽有余摆；经典：固定节奏摆动
                </p>
              </div>
            </div>
          </Section>

            <Section title="AI 生成（可选）">
              <AiSettingsSection />
            </Section>

            <Section title="我的句子">
              <CustomQuotesEditor />
            </Section>
          </div>

          <footer className="border-t border-[rgba(139,111,71,0.12)] px-3 pb-2 pt-1.5 text-[10px]" style={{ color: '#9A8B6F' }}>
            <div className="flex items-center justify-between">
              <span>Ctrl + Shift + Q 切换显隐</span>
              <span>风铃便签 v{pkg.version}</span>
            </div>
          </footer>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
