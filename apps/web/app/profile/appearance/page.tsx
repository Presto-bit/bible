'use client';

import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { useEffect, useState } from 'react';
import {
  APP_THEMES,
  getAppTheme,
  getReaderFollowApp,
  setAppTheme,
  setReaderFollowApp,
  type AppThemeId,
} from '@/lib/app_theme';
import {
  READER_THEMES,
  getReaderTheme,
  setReaderTheme,
  type ReaderTheme,
} from '@/lib/reader_settings';

export default function AppearancePage() {
  useEdgeSwipeBack({ href: '/profile' });

  const [appTheme, setAppThemeState] = useState<AppThemeId>('classic');
  const [readerTheme, setReaderThemeState] = useState<ReaderTheme>('morning');
  const [followApp, setFollowApp] = useState(false);

  useEffect(() => {
    setAppThemeState(getAppTheme());
    setReaderThemeState(getReaderTheme());
    setFollowApp(getReaderFollowApp());
  }, []);

  const pickAppTheme = (id: AppThemeId) => {
    setAppThemeState(id);
    setAppTheme(id);
  };

  const pickReaderTheme = (id: ReaderTheme) => {
    setReaderFollowApp(false);
    setFollowApp(false);
    setReaderThemeState(id);
    setReaderTheme(id);
  };

  const toggleFollow = (on: boolean) => {
    setFollowApp(on);
    setReaderFollowApp(on);
  };

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/profile" label="我的" />
        <h2 className="page-head-title">外观</h2>
      </header>

      <div className="settings-card" style={{ marginTop: 16 }}>
        <p className="settings-title">应用主题</p>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          影响首页、群页、Tab 等全站界面
        </p>
        <div className="appearance-theme-grid">
          {APP_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`appearance-theme-option ${appTheme === t.id ? 'appearance-theme-option-active' : ''}`}
              onClick={() => pickAppTheme(t.id)}
            >
              <span
                className="appearance-theme-swatch"
                style={{ background: t.preview }}
                aria-hidden
              />
              <span className="appearance-theme-label">{t.label}</span>
              <span className="appearance-theme-desc muted">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-card" style={{ marginTop: 12 }}>
        <p className="settings-title">阅读器主题</p>
        <label className="appearance-follow-row">
          <span>跟随应用主题</span>
          <input
            type="checkbox"
            checked={followApp}
            onChange={(e) => toggleFollow(e.target.checked)}
          />
        </label>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          关闭后，阅读页可单独选白/黄/夜，不影响 Tab 与群页
        </p>
        {!followApp ? (
          <div className="reader-theme-swatches">
            {READER_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`reader-theme-swatch ${readerTheme === t.id ? 'reader-theme-swatch-active' : ''}`}
                onClick={() => pickReaderTheme(t.id)}
              >
                <span className={`reader-theme-preview reader-theme-preview-${t.id}`} aria-hidden />
                <span className="reader-theme-swatch-label">{t.label}</span>
                <span className="reader-theme-swatch-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>
            当前跟随「{APP_THEMES.find((t) => t.id === appTheme)?.label ?? '应用'}」主题
          </p>
        )}
      </div>
    </main>
  );
}
