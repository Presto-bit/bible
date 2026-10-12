/** 读经显示偏好：从 localStorage 水合，减轻 ReaderView 内散落初始化。 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getEffectiveReaderTheme, getReaderFollowApp } from '@/lib/app_theme';
import { getReaderFontPx, setReaderFontPx } from '@/lib/reader_preferences';
import {
  getMainVersion,
  getParallelVersion,
  getReadingLayout,
  getVerseNumberMode,
  setMainVersion,
  setParallelVersion,
  setReadingLayout,
  setReaderTheme,
  setVerseNumberMode,
  type ReaderTheme,
  type ReadingLayout,
  type VerseNumberMode,
} from '@/lib/reader_settings';

export function useReaderDisplayPrefs() {
  const [fontPx, setFontPxState] = useState(18);
  const [theme, setThemeState] = useState<ReaderTheme>('morning');
  const [verseNo, setVerseNoState] = useState<VerseNumberMode>('inline');
  const [layout, setLayoutState] = useState<ReadingLayout>('single');
  const [parallelVer, setParallelVerState] = useState('kjv');
  const [mainVersionId, setMainVersionIdState] = useState<string | null>(null);
  const [readerFollow, setReaderFollowState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFontPxState(getReaderFontPx());
    setThemeState(getEffectiveReaderTheme());
    setVerseNoState(getVerseNumberMode());
    setLayoutState(getReadingLayout());
    setParallelVerState(getParallelVersion());
    setMainVersionIdState(getMainVersion());
    setReaderFollowState(getReaderFollowApp());
    setHydrated(true);
  }, []);

  const setFontPx = useCallback((px: number) => {
    setReaderFontPx(px);
    setFontPxState(getReaderFontPx());
  }, []);

  /** 仅更新 UI 状态（跟随 App 主题时不写 localStorage）。 */
  const setTheme = useCallback((t: ReaderTheme) => {
    setThemeState(t);
  }, []);

  /** 用户主动选主题：写偏好并更新状态。 */
  const persistTheme = useCallback((t: ReaderTheme) => {
    setReaderTheme(t);
    setThemeState(t);
  }, []);

  const setVerseNo = useCallback((m: VerseNumberMode) => {
    setVerseNumberMode(m);
    setVerseNoState(m);
  }, []);

  const setLayout = useCallback((l: ReadingLayout) => {
    setReadingLayout(l);
    setLayoutState(l);
  }, []);

  const setParallelVer = useCallback((id: string) => {
    setParallelVersion(id);
    setParallelVerState(id);
  }, []);

  const setMainVersionId = useCallback((id: string | null) => {
    setMainVersion(id);
    setMainVersionIdState(id);
  }, []);

  const syncThemeFromApp = useCallback(() => {
    setThemeState(getEffectiveReaderTheme());
    setReaderFollowState(getReaderFollowApp());
  }, []);

  return {
    hydrated,
    fontPx,
    setFontPx,
    theme,
    setTheme,
    persistTheme,
    verseNo,
    setVerseNo,
    layout,
    setLayout,
    parallelVer,
    setParallelVer,
    mainVersionId,
    setMainVersionId,
    readerFollow,
    setReaderFollow: setReaderFollowState,
    syncThemeFromApp,
  };
}
