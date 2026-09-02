'use client';

import { cycleShelfFontPx, SHELF_FONT_STEPS } from '@/lib/shelf_reading';

export default function ShelfFontButton({
  fontPx,
  onChange,
}: {
  fontPx: number;
  onChange: (px: number) => void;
}) {
  const label = SHELF_FONT_STEPS.find((s) => s.px === fontPx)?.label ?? '中';

  return (
    <button
      type="button"
      className="shelf-font-icon"
      aria-label={`字号 ${label}，点击切换`}
      title={`字号 · ${label}`}
      onClick={() => onChange(cycleShelfFontPx())}
    >
      A<span className="shelf-font-icon-mark">{label}</span>
    </button>
  );
}
