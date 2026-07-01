'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  api,
  type BibleBook,
  type BibleVersion,
  type Verse,
} from '@/lib/api';
import XiaoAiSheet from '@/components/reader/XiaoAiSheet';
import SummarySheet from '@/components/reader/SummarySheet';
import ThoughtWriteSheet from '@/components/reader/ThoughtWriteSheet';
import ThoughtsListSheet from '@/components/reader/ThoughtsListSheet';
import { loadBookSummary, loadChapterSummary } from '@/lib/bible_summary';
import { getCachedChapter, setCachedChapter } from '@/lib/chapter_cache';
import { listNotes, type LocalNote } from '@/lib/notes';
import { notesForChapter } from '@/lib/notes_for_chapter';
import { isFavorite, toggleFavorite } from '@/lib/favorites';
import {
  bookProgressInBible,
  getParallelVersion,
  getMainVersion,
  getReaderTheme,
  getReadingLayout,
  getVerseNumberMode,
  READER_THEMES,
  setMainVersion,
  setParallelVersion,
  setReaderTheme,
  setReadingLayout,
  setVerseNumberMode,
  VERSE_NUMBER_MODES,
  type ReaderTheme,
  type ReadingLayout,
  type VerseNumberMode,
} from '@/lib/reader_settings';
import {
  getLastRead,
  getLastReadVerse,
  logChapterDetail,
  logChapterRead,
  logVerseRead,
  maybeNotifyBookComplete,
  setLastRead,
  setLastReadVerse,
  shouldShowResumeHint,
} from '@/lib/reading';
import { outlineFor } from '@/lib/outlines';
import { groupVersesIntoParagraphs, isPoetryBook } from '@/lib/paragraphs';
import PlanReadingLayer from '@/components/reader/PlanReadingLayer';
import type { PlanReadingMeta } from '@/lib/plan_reading';
import { readerUi } from '@/lib/reader_i18n';
import {
  clearHighlightForSelection,
  findHighlightStorageRef,
  getHighlightMap,
  highlightClass,
  markForVerse,
  pickHighlightColor,
  type HighlightColor,
  type HighlightStyleKey,
} from '@/lib/reader_highlights';
import {
  addThought,
  selectionRef,
  thoughtsForChapter,
} from '@/lib/reader_thoughts';
import {
  FONT_FAMILIES,
  PAGE_TURN_MODES,
  fontFamilyCss,
  getFontFamily,
  getPageTurn,
  getThoughtsOn,
  getUnderlinesOn,
  setFontFamily,
  setPageTurn,
  setThoughtsOn as persistThoughtsOn,
  setUnderlinesOn as persistUnderlinesOn,
  type PageTurnMode,
  type ReaderFontFamily,
} from '@/lib/reader_preferences';

const FONT_SIZES = [
  { label: '中', px: 17 },
  { label: '大', px: 20 },
  { label: '特大', px: 24 },
];

export default function ReaderView({
  book,
  books,
  chapter,
  onChapterChange,
  onPickBook,
  bookAbbr,
  renderVerseText,
  planMeta,
  onPlanMetaChange,
  onPlanJump,
}: {
  book: BibleBook;
  books: BibleBook[];
  chapter: number;
  onChapterChange: (ch: number) => void;
  onPickBook: () => void;
  bookAbbr: (name: string) => string;
  renderVerseText: (text: string, keyBase: string) => React.ReactNode;
  planMeta?: PlanReadingMeta | null;
  onPlanMetaChange?: (m: PlanReadingMeta) => void;
  onPlanJump?: (bookId: string, chapter: number) => void;
}) {
  const [verses, setVerses] = useState<Verse[]>([]);
  /** 中文和合本结构，用于段落断点（KJV 单栏/对照时与中文段落对齐）。 */
  const [layoutVerses, setLayoutVerses] = useState<Verse[]>([]);
  const [parallelVerses, setParallelVerses] = useState<Verse[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [versionLabel, setVersionLabel] = useState('和合本');
  const [fontPx, setFontPx] = useState(17);
  const [showSettings, setShowSettings] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [checkedVers, setCheckedVers] = useState<string[]>(['cnv']);
  const [versions, setVersions] = useState<BibleVersion[] | null>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState<ReaderTheme>('morning');
  const [verseNo, setVerseNo] = useState<VerseNumberMode>('inline');
  const [layout, setLayout] = useState<ReadingLayout>('single');
  const [parallelVer, setParallelVer] = useState('kjv');
  const [mainVersionId, setMainVersionId] = useState<string | null>(null);
  const [chapterAnim, setChapterAnim] = useState('');
  const [resumeFlashVerse, setResumeFlashVerse] = useState<number | null>(null);
  const [markMenuOpen, setMarkMenuOpen] = useState(false);
  const [bookDone, setBookDone] = useState(false);
  const [aiSheet, setAiSheet] = useState(false);
  const [viewNote, setViewNote] = useState<LocalNote | null>(null);
  const [summarySheet, setSummarySheet] = useState<null | { title: string; load: () => Promise<string> }>(null);
  const [chapterNotes, setChapterNotes] = useState<Map<number, LocalNote[]>>(new Map());
  const [, setFavRev] = useState(0);
  const [highlightMap, setHighlightMap] = useState<ReturnType<typeof getHighlightMap>>({});
  const [writeThoughtSheet, setWriteThoughtSheet] = useState<null | { ref: string; label: string }>(null);
  const [thoughtListSheet, setThoughtListSheet] = useState<null | { ref: string; label: string; text: string }>(null);
  const [thoughtRevision, setThoughtRevision] = useState(0);
  const [underlinesOn, setUnderlinesOn] = useState(true);
  const [thoughtsOn, setThoughtsOn] = useState(true);
  const [fontFamily, setFontFamilyState] = useState<ReaderFontFamily>('serif');
  const [pageTurn, setPageTurnState] = useState<PageTurnMode>('swipe');
  const contentRef = useRef<HTMLDivElement>(null);
  const focusBarRef = useRef<HTMLDivElement>(null);
  const [focusBarStyle, setFocusBarStyle] = useState<React.CSSProperties>({});
  const lastScrollTop = useRef(0);
  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSelectAt = useRef(0);
  const syncingSelection = useRef(false);
  const readStartRef = useRef(Date.now());
  const saveVerseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshChapterNotes = useCallback(() => {
    setChapterNotes(notesForChapter(listNotes(), book.id, chapter));
  }, [book.id, chapter]);

  useEffect(() => {
    setHighlightMap(getHighlightMap());
    setUnderlinesOn(getUnderlinesOn());
    setThoughtsOn(getThoughtsOn());
  }, [book.id, chapter]);

  useEffect(() => {
    refreshChapterNotes();
  }, [refreshChapterNotes]);

  const renderNotePin = (verse: number) => {
    const pins = chapterNotes.get(verse);
    if (!pins?.length) return null;
    return (
      <button
        type="button"
        className="verse-note-pin"
        title={englishUI ? 'View note' : '查看笔记'}
        aria-label={englishUI ? 'View note' : '查看笔记'}
        onClick={(e) => {
          e.stopPropagation();
          setViewNote(pins[0]);
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8l-6-6z" />
        </svg>
      </button>
    );
  };
  const poetry = isPoetryBook(book.id);
  const outline = outlineFor(book.id, chapter);
  const biblePct = bookProgressInBible(books, book.id, chapter);

  const structureVerses = layoutVerses.length ? layoutVerses : verses;
  const paragraphs = useMemo(
    () =>
      groupVersesIntoParagraphs(
        book.id,
        structureVerses.map((v) => ({ verse: v.verse, text: v.text })),
        outline.map((s) => s.verse),
      ),
    [book.id, structureVerses, outline],
  );
  const verseDisplayText = useCallback(
    (verseNum: number, fallback: string) =>
      verses.find((x) => x.verse === verseNum)?.text ?? fallback,
    [verses],
  );

  const sortedSel = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);
  const hasSel = sortedSel.length > 0;
  const minV = sortedSel[0];
  const maxV = sortedSel[sortedSel.length - 1];
  const selectionText = useMemo(
    () =>
      verses
        .filter((v) => selected.includes(v.verse))
        .sort((a, b) => a.verse - b.verse)
        .map((v) => v.text)
        .join(''),
    [verses, selected],
  );
  const refParam = hasSel ? `${book.id}.${chapter}.${minV}` : `${book.id}.${chapter}`;
  const refLabel = hasSel
    ? minV === maxV
      ? `${bookAbbr(book.name)} ${chapter}:${minV}`
      : `${bookAbbr(book.name)} ${chapter}:${minV}-${maxV}`
    : `${bookAbbr(book.name)} ${chapter}`;
  const selectedRef = hasSel
    ? minV === maxV
      ? `${book.id}.${chapter}.${minV}`
      : `${book.id}.${chapter}.${minV}-${maxV}`
    : '';

  const effSelectionText = selectionText;
  const effRefParam = refParam;
  const effRefLabel = refLabel;
  const effSelectedRef = selectedRef;

  const chapterThoughts = useMemo(
    () => (thoughtsOn ? thoughtsForChapter(book.id, chapter) : {}),
    [book.id, chapter, thoughtsOn, thoughtRevision],
  );

  const selRef = useMemo(
    () => selectionRef(book.id, chapter, sortedSel),
    [book.id, chapter, sortedSel],
  );

  const currentMark = useMemo(() => {
    if (!selRef || !sortedSel.length) return null;
    const storageRef = findHighlightStorageRef(book.id, chapter, sortedSel, highlightMap);
    if (storageRef) return highlightMap[storageRef] ?? null;
    return highlightMap[selRef] ?? null;
  }, [highlightMap, selRef, book.id, chapter, sortedSel]);

  const renderVerseBody = useCallback(
    (text: string, keyBase: string, flashLead: boolean) => {
      if (!flashLead || !text) return renderVerseText(text, keyBase);
      const lead = text.slice(0, 2);
      const tail = text.slice(2);
      return (
        <>
          <span className="verse-resume-lead-flash">{lead}</span>
          {tail ? renderVerseText(tail, `${keyBase}-tail`) : null}
        </>
      );
    },
    [renderVerseText],
  );

  const updateFocusBarPosition = useCallback(() => {
    if (!hasSel || minV == null) return;
    const firstEl = document.getElementById(`verse-anchor-${minV}`);
    const lastEl = document.getElementById(`verse-anchor-${maxV}`);
    if (!firstEl) return;
    const firstRect = firstEl.getBoundingClientRect();
    const lastRect = lastEl?.getBoundingClientRect() ?? firstRect;
    const selTop = Math.min(firstRect.top, lastRect.top);
    const selBottom = Math.max(firstRect.bottom, lastRect.bottom);
    const selCenterX = (
      Math.min(firstRect.left, lastRect.left) + Math.max(firstRect.right, lastRect.right)
    ) / 2;
    const barH = focusBarRef.current?.offsetHeight ?? 56;
    const margin = 10;
    const topReserve = chromeHidden ? 12 : 52;
    const bottomReserve = chromeHidden ? 24 : 76;
    let top = selTop - barH - margin;
    if (top < topReserve) top = selBottom + margin;
    const maxTop = window.innerHeight - barH - bottomReserve;
    top = Math.max(topReserve, Math.min(top, maxTop));
    setFocusBarStyle({
      top: `${top}px`,
      left: `${selCenterX}px`,
      bottom: 'auto',
      transform: 'translateX(-50%)',
    });
  }, [hasSel, minV, maxV, chromeHidden]);

  useEffect(() => {
    if (!hasSel) {
      setFocusBarStyle({});
      return;
    }
    updateFocusBarPosition();
    const raf = requestAnimationFrame(updateFocusBarPosition);
    const el = contentRef.current;
    el?.addEventListener('scroll', updateFocusBarPosition, { passive: true });
    window.addEventListener('resize', updateFocusBarPosition);
    return () => {
      cancelAnimationFrame(raf);
      el?.removeEventListener('scroll', updateFocusBarPosition);
      window.removeEventListener('resize', updateFocusBarPosition);
    };
  }, [hasSel, selected, chromeHidden, updateFocusBarPosition]);

  const openThoughtListForVerse = (verse: number, text: string) => {
    setThoughtListSheet({
      ref: `${book.id}.${chapter}.${verse}`,
      label: `${bookAbbr(book.name)} ${chapter}:${verse}`,
      text,
    });
  };

  const renderThoughtLine = (para: { verses: { verse: number; text: string }[] }) => {
    if (!thoughtsOn) return null;
    const v = para.verses.find((x) => (chapterThoughts[x.verse] ?? 0) > 0);
    if (!v) return null;
    return (
      <button
        type="button"
        className="verse-thought-line"
        aria-label="查看想法"
        onClick={(e) => {
          e.stopPropagation();
          openThoughtListForVerse(v.verse, verseDisplayText(v.verse, v.text));
        }}
      />
    );
  };

  const verseBlockStyle = {
    fontSize: fontPx,
    lineHeight: poetry ? 2.1 : 1.9,
    fontFamily: fontFamilyCss(fontFamily),
  };

  const englishUI = mainVersionId === 'kjv';
  const ui = readerUi(englishUI);

  const flashToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 1800);
  };

  const applyMarkChoice = useCallback((color: HighlightColor, style: HighlightStyleKey = 'color') => {
    const added = pickHighlightColor(book.id, chapter, sortedSel, color, style);
    setHighlightMap(getHighlightMap());
    flashToast(added ? '已划线' : '已取消划线');
    setMarkMenuOpen(false);
  }, [book.id, chapter, sortedSel]);

  const clearMark = useCallback(() => {
    const ok = clearHighlightForSelection(book.id, chapter, sortedSel);
    if (!ok) return;
    setHighlightMap(getHighlightMap());
    flashToast('已取消划线');
  }, [book.id, chapter, sortedSel]);

  const scheduleChromeHide = useCallback(() => {
    if (chromeTimer.current) clearTimeout(chromeTimer.current);
    setChromeHidden(false);
    chromeTimer.current = setTimeout(() => setChromeHidden(true), 3000);
  }, []);

  useEffect(
    () => () => {
      if (chromeTimer.current) clearTimeout(chromeTimer.current);
    },
    [],
  );

  // 沉浸阅读：顶栏隐藏（进入 3s 后）时，底部 5-Tab 一并下滑隐藏；点按页面恢复。
  useEffect(() => {
    if (chromeHidden) document.body.classList.add('reader-immersive');
    else document.body.classList.remove('reader-immersive');
    return () => document.body.classList.remove('reader-immersive');
  }, [chromeHidden]);

  useEffect(() => {
    setTheme(getReaderTheme());
    setVerseNo(getVerseNumberMode());
    const savedLayout = getReadingLayout();
    const savedParallel = getParallelVersion();
    const savedMain = getMainVersion();
    setLayout(savedLayout);
    setParallelVer(savedParallel);
    setMainVersionId(savedMain);
    if (savedMain) {
      setVersionLabel(savedMain.toUpperCase());
    } else if (savedLayout === 'parallel') {
      setVersionLabel(`和合本 · ${savedParallel.toUpperCase()}`);
    }
    const saved = Number(localStorage.getItem('readerFont'));
    if (saved) setFontPx(saved);
    setFontFamilyState(getFontFamily());
    setPageTurnState(getPageTurn());
    setUnderlinesOn(getUnderlinesOn());
    setThoughtsOn(getThoughtsOn());
  }, []);

  // 译本标签补全（版本列表加载后）。
  useEffect(() => {
    if (!versions?.length) return;
    if (mainVersionId) {
      const v = versions.find((x) => x.id === mainVersionId);
      if (v) setVersionLabel(v.label);
      return;
    }
    if (layout !== 'parallel') return;
    const primary = versions.find((v) => v.primary);
    const compare = versions.find((v) => v.id === parallelVer);
    if (primary && compare) {
      setVersionLabel(`${primary.label} · ${compare.label}`);
    }
  }, [layout, parallelVer, mainVersionId, versions]);

  useEffect(() => {
    if (layout !== 'parallel' || mainVersionId) {
      setParallelVerses([]);
      return;
    }
    void api
      .chapter(book.id, chapter, parallelVer)
      .then((d) => setParallelVerses(d.verses))
      .catch(() => setParallelVerses([]));
  }, [layout, mainVersionId, book.id, chapter, parallelVer]);

  useEffect(() => {
    setVerses([]);
    setLayoutVerses([]);
    setSelected([]);
    setBookDone(false);
    readStartRef.current = Date.now();
    setChapterAnim('chapter-enter');

    const cached = getCachedChapter(book.id, chapter);
    if (cached?.length) setLayoutVerses(cached);
    if (cached?.length && !mainVersionId) setVerses(cached);

    const load = async () => {
      const chinese = await api.chapter(book.id, chapter);
      setLayoutVerses(chinese.verses);
      if (mainVersionId) {
        const alt = await api.chapter(book.id, chapter, mainVersionId);
        setVerses(alt.verses);
      } else {
        setVerses(chinese.verses);
        setCachedChapter(book.id, chapter, chinese.verses);
      }
      logChapterRead();
      logChapterDetail(book.id, chapter);
      maybeNotifyBookComplete(book.id, book.name, book.chapter_count);
      setLastRead(book.id, chapter);
      scheduleChromeHide();

      requestAnimationFrame(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
        const lastV = getLastReadVerse();
        const last = getLastRead();
        if (last && last.bookId === book.id && last.chapter === chapter && lastV && shouldShowResumeHint()) {
          document.getElementById(`verse-anchor-${lastV}`)?.scrollIntoView({ behavior: 'auto', block: 'start' });
          setResumeFlashVerse(lastV);
          window.setTimeout(() => setResumeFlashVerse(null), 2600);
        }
      });
    };
    void load().catch(() => flashToast('加载失败'));
  }, [book, chapter, mainVersionId, scheduleChromeHide, bookAbbr]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      const cur = el.scrollTop;
      if (cur < lastScrollTop.current - 4) scheduleChromeHide();
      lastScrollTop.current = cur;

      if (saveVerseTimer.current) clearTimeout(saveVerseTimer.current);
      saveVerseTimer.current = setTimeout(() => {
        const mid = el.scrollTop + el.clientHeight * 0.2;
        let bestVerse: number | null = null;
        let bestDist = Infinity;
        for (const v of verses) {
          const anchor = document.getElementById(`verse-anchor-${v.verse}`);
          if (!anchor) continue;
          const dist = Math.abs(anchor.offsetTop - mid);
          if (dist < bestDist) {
            bestDist = dist;
            bestVerse = v.verse;
          }
        }
        if (bestVerse != null) setLastReadVerse(bestVerse);
      }, 200);

      if (bookDone) return;
      if (chapter < book.chapter_count) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (nearBottom && verses.length > 0) {
        setBookDone(true);
        flashToast(`🎉 恭喜读完《${book.name}》`);
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (saveVerseTimer.current) clearTimeout(saveVerseTimer.current);
    };
  }, [verses, bookDone, chapter, book.chapter_count, book.name, scheduleChromeHide]);

  const navChapter = (delta: number) => {
    setChapterAnim(delta > 0 ? 'chapter-exit-left' : 'chapter-exit-right');
    setTimeout(() => {
      onChapterChange(Math.min(book.chapter_count, Math.max(1, chapter + delta)));
      setChapterAnim('chapter-enter');
    }, 180);
  };

  const versesInRange = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  };

  const verseFromNode = (node: Node | null): number | null => {
    if (!node || !contentRef.current) return null;
    let el: Element | null = node instanceof Element ? node : node.parentElement;
    while (el && contentRef.current.contains(el)) {
      const m = el.id?.match(/^verse-anchor-(\d+)$/);
      if (m) return Number(m[1]);
      el = el.parentElement;
    }
    return null;
  };

  const syncSelectionFromDom = useCallback(() => {
    if (syncingSelection.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current) return;
    const anchor = verseFromNode(sel.anchorNode);
    const focus = verseFromNode(sel.focusNode);
    if (anchor == null && focus == null) return;
    const lo = Math.min(anchor ?? focus!, focus ?? anchor!);
    const hi = Math.max(anchor ?? focus!, focus ?? anchor!);
    const next = versesInRange(lo, hi);
    syncingSelection.current = true;
    setSelected(next);
    setLastReadVerse(hi);
    lastSelectAt.current = Date.now();
    logVerseRead(`${book.id}.${chapter}.${hi}`);
    scheduleChromeHide();
    syncingSelection.current = false;
  }, [book.id, chapter, scheduleChromeHide]);

  useEffect(() => {
    const onSel = () => syncSelectionFromDom();
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [syncSelectionFromDom]);

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelected([]);
    setMarkMenuOpen(false);
  };

  const saveFavorite = () => {
    const ref = effSelectedRef || refParam;
    const added = toggleFavorite(ref);
    setFavRev((n) => n + 1);
    flashToast(added ? (englishUI ? 'Saved' : '已收藏') : (englishUI ? 'Removed' : '已取消收藏'));
  };

  const favActive = isFavorite(effSelectedRef || refParam);

  return (
    <main
      className={`container reader-page reader-theme-${theme} ${poetry ? 'reader-poetry' : 'reader-prose'}`}
      onClick={() => {
        // 忽略长按/双击后的余波点击，避免立即取消选中。
        if (Date.now() - lastSelectAt.current < 500) return;
        if (aiSheet) {
          scheduleChromeHide();
          return;
        }
        if (viewNote) {
          setViewNote(null);
          return;
        }
        if (summarySheet) return;
        if (hasSel) clearSelection();
        scheduleChromeHide();
      }}
    >
      <div className="reader-book-progress">
        <div className="reader-book-progress-fill" style={{ width: `${biblePct}%` }} />
      </div>

      {!chromeHidden && (
        <div className="reader-topbar">
          <div className="reader-topbar-left">
            <Link
              href="/search"
              className="reader-icon-btn"
              aria-label="搜索"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
            </Link>
            <button type="button" className="reader-loc" onClick={(e) => { e.stopPropagation(); onPickBook(); }}>
              {bookAbbr(book.name)} {chapter}
            </button>
            <button type="button" className="reader-version" onClick={(e) => {
              e.stopPropagation();
              const primaryId = versions?.find((v) => v.primary)?.id ?? 'cnv';
              if (mainVersionId) setCheckedVers([mainVersionId]);
              else if (layout === 'parallel') setCheckedVers([primaryId, parallelVer]);
              else setCheckedVers([primaryId]);
              setShowVersions(true);
              if (!versions) api.versions().then((d) => setVersions(d.versions)).catch(() => setVersions([]));
            }}>
              {versionLabel}
            </button>
          </div>
          <div className="reader-topbar-right">
            <button type="button" className="reader-more" onClick={(e) => { e.stopPropagation(); setShowSettings(true); }} aria-label="阅读设置">
              ⋮
            </button>
          </div>
        </div>
      )}

      <div
        ref={contentRef}
        className={`reader-content ${chapterAnim}`}
        style={{
          marginTop: chromeHidden ? 0 : 12,
          maxHeight: chromeHidden ? 'calc(100dvh - 28px)' : 'calc(100dvh - 88px)',
        }}
        onTouchStart={pageTurn === 'swipe' ? (e) => {
          (contentRef.current as HTMLDivElement & { _tx?: number })._tx = e.touches[0].clientX;
        } : undefined}
        onTouchEnd={pageTurn === 'swipe' ? (e) => {
          const tx = (contentRef.current as HTMLDivElement & { _tx?: number })._tx;
          if (tx == null) return;
          const dx = e.changedTouches[0].clientX - tx;
          if (dx < -60) navChapter(1);
          else if (dx > 60) navChapter(-1);
        } : undefined}
      >
        {planMeta && onPlanMetaChange && onPlanJump && (
          <PlanReadingLayer
            meta={planMeta}
            bookId={book.id}
            chapter={chapter}
            onMetaChange={onPlanMetaChange}
            onJump={onPlanJump}
          />
        )}
        <div className="reader-chapter-head">
          <button
            type="button"
            className="reader-head-link"
            onClick={(e) => {
              e.stopPropagation();
              setSummarySheet({
                title: `${book.name} · 整卷概览`,
                load: () => loadBookSummary(book.id, book.name),
              });
            }}
          >
            {book.name}
          </button>
          <span className="reader-head-sep">·</span>
          <button
            type="button"
            className="reader-head-link reader-head-chapter"
            onClick={(e) => {
              e.stopPropagation();
              setSummarySheet({
                title: `${book.name} ${englishUI ? `Chapter ${chapter}` : `第 ${chapter} 章`}`,
                load: () => loadChapterSummary(book.id, book.name, chapter),
              });
            }}
          >
            {englishUI ? `Chapter ${chapter}` : `第 ${chapter} 章`}
          </button>
        </div>

        {verses.length === 0 ? (
          <p className="muted">{ui.loading}</p>
        ) : layout === 'parallel' && !mainVersionId && parallelVerses.length > 0 ? (
          <div className="reader-parallel">
            {paragraphs.map((para) => {
              const marks = outline.filter((s) => s.verse >= para.startVerse && s.verse <= para.endVerse);
              const firstMark = marks.find((m) => m.verse === para.startVerse) || marks[0];
              return (
                <div key={para.startVerse} className="reader-parallel-block">
                  {firstMark && firstMark.verse === para.startVerse && (
                    <div className="section-title">{firstMark.title}</div>
                  )}
                  <div
                    className={`reader-parallel-row verse-paragraph verse-no-${verseNo}`}
                    style={verseBlockStyle}
                  >
                    <div className="reader-parallel-primary">
                      {para.verses.map((v) => {
                        const text = verseDisplayText(v.verse, v.text);
                        const mark = underlinesOn ? markForVerse(highlightMap, book.id, chapter, v.verse) : null;
                        return (
                          <span
                            key={v.verse}
                            id={`verse-anchor-${v.verse}`}
                            className={`verse-inline verse-token ${highlightClass(mark)}`}
                          >
                            {verseNo !== 'hidden' && (
                              <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
                            )}
                            {renderVerseBody(text, `p${v.verse}`, resumeFlashVerse === v.verse)}
                            {renderNotePin(v.verse)}{' '}
                          </span>
                        );
                      })}
                    </div>
                    <div className="reader-parallel-secondary muted">
                      {para.verses.map((v) => {
                        const p2 = parallelVerses.find((x) => x.verse === v.verse);
                        return (
                          <span key={v.verse} className="verse-inline">
                            {verseNo !== 'hidden' && (
                              <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
                            )}
                            {p2?.text ?? '—'}{' '}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {renderThoughtLine(para)}
                </div>
              );
            })}
          </div>
        ) : (
          paragraphs.map((para) => {
            const marks = outline.filter((s) => s.verse >= para.startVerse && s.verse <= para.endVerse);
            const firstMark = marks.find((m) => m.verse === para.startVerse) || marks[0];
            return (
              <div key={para.startVerse}>
                {firstMark && firstMark.verse === para.startVerse && (
                  <div className="section-title">{firstMark.title}</div>
                )}
                <div
                  className={`verse-paragraph verse-no-${verseNo}`}
                  style={verseBlockStyle}
                >
                  {para.verses.map((v) => {
                    const mark = underlinesOn ? markForVerse(highlightMap, book.id, chapter, v.verse) : null;
                    return (
                    <span
                      key={v.verse}
                      id={`verse-anchor-${v.verse}`}
                      className={`verse-inline verse-token ${highlightClass(mark)}`}
                    >
                      {verseNo !== 'hidden' && (
                        <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
                      )}
                      {renderVerseBody(
                        verseDisplayText(v.verse, v.text),
                        `v${v.verse}`,
                        resumeFlashVerse === v.verse,
                      )}
                      {renderNotePin(v.verse)}{' '}
                    </span>
                    );
                  })}
                </div>
                {renderThoughtLine(para)}
              </div>
            );
          })
        )}
      </div>

      {!chromeHidden && !hasSel && (
        <button
          type="button"
          className="reader-fab"
          onClick={(e) => { e.stopPropagation(); setAiSheet(true); }}
          aria-label="问小爱"
        >
          ✦ 小爱
        </button>
      )}

      {hasSel && (
        <div
          ref={focusBarRef}
          className="reader-focus-bar reader-focus-bar-ext reader-focus-bar-near"
          style={focusBarStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="reader-focus-row">
            {underlinesOn && (
              <div className="reader-mark-wrap">
                <button
                  type="button"
                  className={`vsb-item ${currentMark ? 'vsb-item-active' : ''}`}
                  onClick={() => setMarkMenuOpen((v) => !v)}
                >
                  划线
                </button>
                {markMenuOpen && (
                  <div className="reader-mark-popover" role="dialog" aria-label="划线样式">
                    {([
                      { key: 'color' as HighlightStyleKey, label: '荧光' },
                      { key: 'solid' as HighlightStyleKey, label: '实线' },
                      { key: 'dashed' as HighlightStyleKey, label: '虚线' },
                    ]).map((style) => (
                      <div key={style.key} className="reader-mark-style-row">
                        <span className="reader-mark-style-label">{style.label}</span>
                        <div className="reader-weread-colors">
                          {(['yellow', 'green', 'blue', 'pink', 'orange'] as HighlightColor[]).map((c) => (
                            <button
                              key={`${style.key}-${c}`}
                              type="button"
                              className={`reader-weread-dot reader-mark-dot-${c} ${currentMark?.color === c && currentMark?.style === style.key ? 'reader-weread-dot-active' : ''}`}
                              aria-label={`${style.label} ${c}`}
                              onClick={() => applyMarkChoice(c, style.key)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {currentMark && (
                      <button type="button" className="reader-weread-clear reader-mark-clear-btn" onClick={clearMark}>
                        清除划线
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {thoughtsOn && (
              <button type="button" className="vsb-item" onClick={() => {
                setWriteThoughtSheet({ ref: selRef, label: effRefLabel });
                clearSelection();
              }}>写想法</button>
            )}
            <button type="button" className={`vsb-item ${favActive ? 'vsb-item-active' : ''}`} onClick={saveFavorite}>
              {englishUI ? 'Save' : '收藏'}
            </button>
            <button type="button" className="vsb-item" onClick={() => { navigator.clipboard.writeText(`${effRefLabel} ${effSelectionText}`); flashToast(englishUI ? 'Copied' : '已复制'); }}>{ui.copy}</button>
            <button type="button" className="vsb-item" onClick={() => setAiSheet(true)}>{ui.askAi}</button>
          </div>
        </div>
      )}

      {writeThoughtSheet && (
        <ThoughtWriteSheet
          refLabel={writeThoughtSheet.label}
          onPublish={(body) => {
            addThought(writeThoughtSheet.ref, body);
            setThoughtRevision((n) => n + 1);
            flashToast('想法已发布');
            setWriteThoughtSheet(null);
          }}
          onClose={() => setWriteThoughtSheet(null)}
        />
      )}

      {thoughtListSheet && (
        <ThoughtsListSheet
          refStr={thoughtListSheet.ref}
          refLabel={thoughtListSheet.label}
          verseText={thoughtListSheet.text}
          onClose={() => setThoughtListSheet(null)}
        />
      )}

      {toast && <div className="reader-toast">{toast}</div>}

      {showSettings && (
        <div className="sheet-backdrop" onClick={() => setShowSettings(false)}>
          <div className="sheet card reader-settings-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{ui.settings}</h3>
            <p className="muted" style={{ fontSize: 12 }}>{ui.theme}</p>
            <div className="reader-theme-swatches">
              {READER_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`reader-theme-swatch ${theme === t.id ? 'reader-theme-swatch-active' : ''}`}
                  onClick={() => { setTheme(t.id); setReaderTheme(t.id); }}
                >
                  <span className={`reader-theme-preview reader-theme-preview-${t.id}`} aria-hidden />
                  <span className="reader-theme-swatch-label">{t.label}</span>
                  <span className="reader-theme-swatch-desc">{t.desc}</span>
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>{ui.verseNo}</p>
            <div className="font-pills">
              {VERSE_NUMBER_MODES.map((m) => (
                <button key={m.id} type="button" className={`font-pill ${verseNo === m.id ? 'font-pill-active' : ''}`} onClick={() => { setVerseNo(m.id); setVerseNumberMode(m.id); }}>{m.label}</button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>{ui.parallelLayout}</p>
            <div className="font-pills">
              <button type="button" className={`font-pill ${layout === 'single' ? 'font-pill-active' : ''}`} onClick={() => { setLayout('single'); setReadingLayout('single'); }}>{ui.singleLayout}</button>
              <button type="button" className={`font-pill ${layout === 'parallel' ? 'font-pill-active' : ''}`} onClick={() => { setMainVersionId(null); setMainVersion(null); setLayout('parallel'); setReadingLayout('parallel'); setParallelVersion(parallelVer); }}>{ui.parallelLayout}</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>{ui.fontSize}</p>
            <div className="font-pills">
              {FONT_SIZES.map((f) => (
                <button key={f.px} type="button" className={`font-pill ${fontPx === f.px ? 'font-pill-active' : ''}`} onClick={() => { setFontPx(f.px); localStorage.setItem('readerFont', String(f.px)); }}>{f.label}</button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>字体样式</p>
            <div className="font-pills">
              {FONT_FAMILIES.map((f) => (
                <button key={f.id} type="button" className={`font-pill ${fontFamily === f.id ? 'font-pill-active' : ''}`} onClick={() => { setFontFamilyState(f.id); setFontFamily(f.id); }}>{f.label}</button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>翻页方式</p>
            <div className="font-pills">
              {PAGE_TURN_MODES.map((m) => (
                <button key={m.id} type="button" className={`font-pill ${pageTurn === m.id ? 'font-pill-active' : ''}`} onClick={() => { setPageTurnState(m.id); setPageTurn(m.id); }}>{m.label}</button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>显示选项</p>
            <label className="reader-toggle-row">
              <span>显示划线</span>
              <input type="checkbox" checked={underlinesOn} onChange={(e) => { setUnderlinesOn(e.target.checked); persistUnderlinesOn(e.target.checked); }} />
            </label>
            <label className="reader-toggle-row">
              <span>显示想法</span>
              <input type="checkbox" checked={thoughtsOn} onChange={(e) => { setThoughtsOn(e.target.checked); persistThoughtsOn(e.target.checked); }} />
            </label>
          </div>
        </div>
      )}

      {aiSheet && (
        <XiaoAiSheet
          key={`ask-${effRefParam}`}
          mode="ask"
          refParam={effRefParam}
          refLabel={effRefLabel}
          selectionText={effSelectionText}
          onClose={() => setAiSheet(false)}
        />
      )}

      {summarySheet && (
        <SummarySheet
          title={summarySheet.title}
          load={summarySheet.load}
          onClose={() => setSummarySheet(null)}
        />
      )}

      {viewNote && (
        <div className="sheet-backdrop" onClick={() => setViewNote(null)}>
          <div className="half-sheet note-view-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="half-sheet-head">
              <div className="half-sheet-title">
                <strong>{englishUI ? 'Note' : '经文笔记'}</strong>
                <button type="button" className="text-link" onClick={() => setViewNote(null)}>{englishUI ? 'Close' : '关闭'}</button>
              </div>
            </div>
            <div className="half-sheet-body">
              {viewNote.ref && <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{viewNote.ref}</p>}
              <p style={{ lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{viewNote.body}</p>
            </div>
          </div>
        </div>
      )}

      {showVersions && (
        <div className="version-pop-backdrop" onClick={() => setShowVersions(false)}>
          <div className="version-pop card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{ui.pickVersion}</h3>
            <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{ui.versionHint}</p>
            {(versions ?? []).map((vv) => {
              const primaryId = versions?.find((v) => v.primary)?.id ?? 'cnv';
              const checked = checkedVers.includes(vv.id);
              return (
                <button
                  key={vv.id}
                  type="button"
                  className={`version-row ${checked ? 'version-row-active' : ''}`}
                  disabled={!vv.available}
                  onClick={() => {
                    let next = [...checkedVers];
                    if (checked) {
                      if (vv.primary && next.length === 1) return;
                      next = next.filter((x) => x !== vv.id);
                      if (next.length === 0) next = [primaryId];
                    } else if (next.length < 2) {
                      next.push(vv.id);
                    } else {
                      next = [next[0], vv.id];
                    }
                    setCheckedVers(next);
                    const primary = versions?.find((v) => v.primary);
                    const primaryLabel = primary?.label ?? (englishUI ? 'Chinese Union' : '和合本');
                    if (next.length === 1) {
                      const id = next[0];
                      if (id === primaryId) {
                        setMainVersionId(null);
                        setMainVersion(null);
                        setLayout('single');
                        setReadingLayout('single');
                        setVersionLabel(primary?.label ?? primaryLabel);
                      } else {
                        setMainVersionId(id);
                        setMainVersion(id);
                        setLayout('single');
                        setReadingLayout('single');
                        const v = versions?.find((x) => x.id === id);
                        setVersionLabel(v?.label ?? id.toUpperCase());
                      }
                    } else {
                      const compareId = next.find((x) => x !== primaryId) ?? 'kjv';
                      const compare = versions?.find((v) => v.id === compareId);
                      setMainVersionId(null);
                      setMainVersion(null);
                      setParallelVer(compareId);
                      setParallelVersion(compareId);
                      setLayout('parallel');
                      setReadingLayout('parallel');
                      setVersionLabel(`${primaryLabel} · ${compare?.label ?? compareId.toUpperCase()}`);
                    }
                  }}
                >
                  <span>{vv.label}</span>
                  <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>
                    {checked ? '✓' : vv.primary ? (englishUI ? 'Default' : '默认') : ''}
                  </span>
                </button>
              );
            })}
            <button type="button" className="btn" style={{ width: '100%', marginTop: 12 }} onClick={() => setShowVersions(false)}>
              {englishUI ? 'Done' : '完成'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
