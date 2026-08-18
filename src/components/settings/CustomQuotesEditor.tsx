import { useState } from 'react';
import { useWidgetStore } from '../../stores/widgetStore';

/** 自定义句子的增删列表 */
export function CustomQuotesEditor(): JSX.Element {
  const customQuotes = useWidgetStore((s) => s.customQuotes);
  const addCustomQuote = useWidgetStore((s) => s.addCustomQuote);
  const removeCustomQuote = useWidgetStore((s) => s.removeCustomQuote);
  const [draft, setDraft] = useState('');

  const submit = (): void => {
    const value = draft.trim();
    if (!value) return;
    addCustomQuote(value);
    setDraft('');
  };

  return (
    <div>
      <div className="flex gap-1">
        <input
          value={draft}
          maxLength={30}
          placeholder="写一句自己的话…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          className="min-w-0 flex-1 rounded border border-[rgba(139,111,71,0.25)] bg-white/70 px-2 py-1 text-[11px] text-[#4A3728] outline-none focus:border-[#8B6F47]"
        />
        <button
          type="button"
          onClick={submit}
          className="shrink-0 rounded bg-[#8B6F47] px-2 py-1 text-[11px] text-white active:scale-95"
          style={{ willChange: 'transform' }}
        >
          添加
        </button>
      </div>

      {customQuotes.length > 0 && (
        <ul className="thin-scroll mt-1.5 max-h-[92px] overflow-y-auto pr-1">
          {customQuotes.map((quote, index) => (
            <li
              key={`${quote}-${index}`}
              className="mb-1 flex items-start justify-between gap-1 rounded bg-white/50 px-1.5 py-1 text-[11px] leading-snug text-[#4A3728]"
            >
              <span className="break-all">{quote}</span>
              <button
                type="button"
                title="删除"
                onClick={() => removeCustomQuote(index)}
                className="shrink-0 text-[#B25B4E] hover:text-[#8E3F34]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1 text-[10px] leading-snug" style={{ color: '#9A8B6F' }}>
        自定义句子会与预置池一同参与随机与每日选句。
      </p>
    </div>
  );
}
