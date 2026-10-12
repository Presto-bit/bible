/** 读经设置半屏（状态由 ReaderView 注入）。 */
'use client';

import Link from 'next/link';
import type { QuoteDisplayMode } from '@/lib/quote_display';
import { QUOTE_DISPLAY_MODES } from '@/lib/quote_display';
import {
  FONT_FAMILIES,
  PAGE_TURN_MODES,
  READING_MODES,
  setFontFamily,
  setPageTurn,
  setReadingMode as persistReadingMode,
  setShowParallelDiff as persistShowParallelDiff,
  setThoughtsOn as persistThoughtsOn,
  setUnderlinesOn as persistUnderlinesOn,
  type PageTurnMode,
  type ReaderFontFamily,
  type ReadingMode,
} from '@/lib/reader_preferences';
import {
  READER_THEMES,
  VERSE_NUMBER_MODES,
  type ReaderTheme,
  type ReadingLayout,
  type VerseNumberMode,
} from '@/lib/reader_settings';
import { getEffectiveReaderTheme, setReaderFollowApp } from '@/lib/app_theme';
import ReaderSheetPortal from '@/components/reader/ReaderSheetPortal';

const FONT_SIZES = [
  { label: '中', px: 18 },
  { label: '大', px: 20 },
  { label: '特大', px: 24 },
];

export type ReaderSettingsPanelProps = {
  settingsTitle: string;
  verseNoLabel: string;
  parallelLayoutLabel: string;
  singleLayoutLabel: string;
  fontSizeLabel: string;
  onClose: () => void;
  readingMode: ReadingMode;
  setReadingMode: (m: ReadingMode) => void;
  theme: ReaderTheme;
  persistTheme: (t: ReaderTheme) => void;
  setTheme: (t: ReaderTheme) => void;
  readerFollow: boolean;
  setReaderFollow: (v: boolean) => void;
  verseNo: VerseNumberMode;
  setVerseNo: (m: VerseNumberMode) => void;
  layout: ReadingLayout;
  setLayout: (l: ReadingLayout) => void;
  parallelVer: string;
  setParallelVer: (id: string) => void;
  setMainVersionId: (id: string | null) => void;
  showParallelDiff: boolean;
  setShowParallelDiff: (v: boolean) => void;
  fontPx: number;
  setFontPx: (n: number) => void;
  fontFamily: ReaderFontFamily;
  setFontFamilyState: (f: ReaderFontFamily) => void;
  pageTurn: PageTurnMode;
  setPageTurnState: (m: PageTurnMode) => void;
  underlinesOn: boolean;
  setUnderlinesOn: (v: boolean) => void;
  thoughtsOn: boolean;
  setThoughtsOn: (v: boolean) => void;
  quoteDisplayMode: QuoteDisplayMode;
  onQuoteDisplayModeChange?: (m: QuoteDisplayMode) => void;
};

export default function ReaderSettingsPanel(p: ReaderSettingsPanelProps) {
  return (
    <ReaderSheetPortal
      onClose={p.onClose}
      sheetClassName="sheet card reader-settings-sheet"
      title={<h3>{p.settingsTitle}</h3>}
    >
      <p className="muted" style={{ fontSize: 12 }}>
        阅读模式
      </p>
      <div className="font-pills">
        {READING_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`font-pill ${p.readingMode === m.id ? 'font-pill-active' : ''}`}
            onClick={() => {
              p.setReadingMode(m.id);
              persistReadingMode(m.id);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
        {READING_MODES.find((m) => m.id === p.readingMode)?.hint}
      </p>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        阅读器主题
      </p>
      <div className="reader-theme-swatches">
        {READER_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`reader-theme-swatch ${p.theme === t.id ? 'reader-theme-swatch-active' : ''}`}
            disabled={p.readerFollow}
            onClick={() => {
              p.setReaderFollow(false);
              setReaderFollowApp(false);
              p.persistTheme(t.id);
            }}
          >
            <span className={`reader-theme-preview reader-theme-preview-${t.id}`} aria-hidden />
            <span className="reader-theme-swatch-label">{t.label}</span>
            <span className="reader-theme-swatch-desc">{t.desc}</span>
          </button>
        ))}
      </div>
      <label className="appearance-follow-row" style={{ marginTop: 12 }}>
        <span>跟随应用主题</span>
        <input
          type="checkbox"
          checked={p.readerFollow}
          onChange={(e) => {
            const on = e.target.checked;
            p.setReaderFollow(on);
            setReaderFollowApp(on);
            if (on) p.setTheme(getEffectiveReaderTheme());
          }}
        />
      </label>
      <Link href="/profile/appearance" className="muted" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        更多外观选项 ›
      </Link>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        {p.verseNoLabel}
      </p>
      <div className="font-pills">
        {VERSE_NUMBER_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`font-pill ${p.verseNo === m.id ? 'font-pill-active' : ''}`}
            onClick={() => {
              p.setVerseNo(m.id);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        {p.parallelLayoutLabel}
      </p>
      <div className="font-pills">
        <button
          type="button"
          className={`font-pill ${p.layout === 'single' ? 'font-pill-active' : ''}`}
          onClick={() => {
            p.setLayout('single');
          }}
        >
          {p.singleLayoutLabel}
        </button>
        <button
          type="button"
          className={`font-pill ${p.layout === 'parallel' ? 'font-pill-active' : ''}`}
          onClick={() => {
            p.setMainVersionId(null);
            p.setLayout('parallel');
            p.setParallelVer(p.parallelVer);
          }}
        >
          {p.parallelLayoutLabel}
        </button>
      </div>
      {p.layout === 'parallel' && p.readingMode === 'study' ? (
        <label className="reader-toggle-row" style={{ marginTop: 8 }}>
          <span>显示措辞差异</span>
          <input
            type="checkbox"
            checked={p.showParallelDiff}
            onChange={(e) => {
              p.setShowParallelDiff(e.target.checked);
              persistShowParallelDiff(e.target.checked);
            }}
          />
        </label>
      ) : null}
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        {p.fontSizeLabel}
      </p>
      <div className="font-pills">
        {FONT_SIZES.map((f) => (
          <button
            key={f.px}
            type="button"
            className={`font-pill ${p.fontPx === f.px ? 'font-pill-active' : ''}`}
            onClick={() => {
              p.setFontPx(f.px);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        字体样式
      </p>
      <div className="font-pills">
        {FONT_FAMILIES.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`font-pill ${p.fontFamily === f.id ? 'font-pill-active' : ''}`}
            onClick={() => {
              p.setFontFamilyState(f.id);
              setFontFamily(f.id);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        翻页方式
      </p>
      <div className="font-pills">
        {PAGE_TURN_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`font-pill ${p.pageTurn === m.id ? 'font-pill-active' : ''}`}
            onClick={() => {
              p.setPageTurnState(m.id);
              setPageTurn(m.id);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        显示选项
      </p>
      <label className="reader-toggle-row">
        <span>显示划线</span>
        <input
          type="checkbox"
          checked={p.underlinesOn}
          onChange={(e) => {
            p.setUnderlinesOn(e.target.checked);
            persistUnderlinesOn(e.target.checked);
          }}
        />
      </label>
      <label className="reader-toggle-row">
        <span>显示想法</span>
        <input
          type="checkbox"
          checked={p.thoughtsOn}
          onChange={(e) => {
            p.setThoughtsOn(e.target.checked);
            persistThoughtsOn(e.target.checked);
          }}
        />
      </label>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        引号样式
      </p>
      <div className="font-pills">
        {QUOTE_DISPLAY_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`font-pill ${p.quoteDisplayMode === m.id ? 'font-pill-active' : ''}`}
            title={m.hint}
            onClick={() => p.onQuoteDisplayModeChange?.(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </ReaderSheetPortal>
  );
}
