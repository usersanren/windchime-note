import type { ReactNode } from 'react';

export function SectionTitle({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-[#8B6F47]">{children}</div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="border-b border-[rgba(139,111,71,0.12)] px-3 py-2.5 last:border-b-0">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between text-[12px] text-[#4A3728]"
    >
      <span>{label}</span>
      <span
        className={`relative h-[18px] w-[32px] rounded-full transition-colors ${
          checked ? 'bg-[#8B6F47]' : 'bg-[rgba(139,111,71,0.28)]'
        }`}
      >
        <span
          className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all"
          style={{ left: checked ? 16 : 2, willChange: 'transform' }}
        />
      </span>
    </button>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
}): JSX.Element {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-[rgba(139,111,71,0.25)] bg-white/70 px-2 py-1 text-[11px] text-[#4A3728] outline-none focus:border-[#8B6F47]"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    />
  );
}
