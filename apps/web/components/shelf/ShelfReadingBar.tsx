'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  bumpShelfFontPx,
  getShelfFontPx,
  getShelfFontFamily,
  getShelfLineHeight,
  setShelfFontPx,
  setShelfFontFamily,
  setShelfLineHeight,
  SHELF_FONT_STEPS,
  type ShelfFontFamily,
} from '@/lib/shelf_reading';

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
  const prefs = useShelfReadingPrefs();
  return [prefs.fontPx, prefs.setFontPx];
}

export function useShelfReadingPrefs() {
  const [fontPx, setFontPxState] = useState(18);
  const [lineHeight, setLineHeightState] = useState(1.9);
  const [fontFamily, setFontFamilyState] = useState<ShelfFontFamily>('serif');
  const [, syncTick] = useState(0);

  const sync = useCallback(() => {
    setFontPxState(getShelfFontPx());
    setLineHeightState(getShelfLineHeight());
    setFontFamilyState(getShelfFontFamily());
    syncTick((n) => n + 1);
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', sync);
    };
  }, [sync]);

  const setFontPx = useCallback((px: number) => {
    setShelfFontPx(px);
    setFontPxState(getShelfFontPx());
  }, []);

  const setLineHeight = useCallback((value: number) => {
    setShelfLineHeight(value);
    setLineHeightState(getShelfLineHeight());
  }, []);

  const setFontFamily = useCallback((family: ShelfFontFamily) => {
    setShelfFontFamily(family);
    setFontFamilyState(getShelfFontFamily());
  }, []);

  return { fontPx, lineHeight, fontFamily, setFontPx, setLineHeight, setFontFamily };
}
