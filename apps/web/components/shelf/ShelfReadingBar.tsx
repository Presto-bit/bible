'use client';

import { useCallback, useEffect, useState } from 'react';
import { bumpShelfFontPx, getShelfFontPx, setShelfFontPx, SHELF_FONT_STEPS } from '@/lib/shelf_reading';

type Props = {
  fontPx: number;
  onChange: (px: number) => void;
};

export default function ShelfReadingBar({ fontPx, onChange }: Props) {
  return (
    <div className="shelf-reading-bar" aria-label="阅读设置">
      <button
        type="button"
        className="shelf-reading-btn"
        aria-label="减小字号"
        onClick={() => onChange(bumpShelfFontPx(-1))}
      >
        A−
      </button>
      <span className="shelf-reading-size" aria-live="polite">
        {SHELF_FONT_STEPS.find((s) => s.px === fontPx)?.label ?? fontPx}
      </span>
      <button
        type="button"
        className="shelf-reading-btn"
        aria-label="增大字号"
        onClick={() => onChange(bumpShelfFontPx(1))}
      >
        A+
      </button>
    </div>
  );
}

export function useShelfFontPx(): [number, (px: number) => void] {
  const [fontPx, setFontPxState] = useState(18);

  useEffect(() => {
    setFontPxState(getShelfFontPx());
  }, []);

  const setFontPxAndStore = useCallback((px: number) => {
    setShelfFontPx(px);
    setFontPxState(getShelfFontPx());
  }, []);

  return [fontPx, setFontPxAndStore];
}
