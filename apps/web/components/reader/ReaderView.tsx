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
import GroupCheckinSheet from '@/components/group/GroupCheckinSheet';
import { loadBookSummary, loadChapterSummary } from '@/lib/bible_summary';
import { getCachedChapter, setCachedChapter } from '@/lib/chapter_cache';
import {
  chapterCacheVersion,
  getChapterVersesSync,
  loadChapterVerses,
} from '@/lib/chapter_prefetch';
import {
  canNavigateChapter,
  prefetchReaderVicinity,
  resolveChapterNav,
} from '@/lib/reader_navigation';
import { listNotes, type LocalNote } from '@/lib/notes';
import { notesForChapter } from '@/lib/notes_for_chapter';
import {
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
  readerThemeBackground,
  VERSE_NUMBER_MODES,
  type ReaderTheme,
  type ReadingLayout,
  type VerseNumberMode,
} from '@/lib/reader_settings';
import {
  getLastRead,
  getLastReadVerse,
  cancelPendingChapterProgress,
  confirmChapterProgress,
  logChapterDetail,
  scheduleChapterProgress,
  logVerseRead,
  maybeNotifyBookComplete,
  readerDwellPause,
  readerDwellResume,
  setLastRead,
  setLastReadVerse,
  shouldShowResumeHint,
} from '@/lib/reading';
import { outlineFor } from '@/lib/outlines';
import { groupVersesIntoParagraphs, isPoetryBook } from '@/lib/paragraphs';
import PlanReadingLayer from '@/components/reader/PlanReadingLayer';
import ReaderChapterPeek from '@/components/reader/ReaderChapterPeek';
import { useReaderPageTurn } from '@/components/reader/useReaderPageTurn';
import type { PlanReadingMeta } from '@/lib/plan_reading';
import { readerUi } from '@/lib/reader_i18n';
import MarkNoteBar from '@/components/reader/MarkNoteBar';
import { ReaderSkeleton } from '@/components/Skeleton';
import { MARK_COLOR_SEMANTICS, MARK_COLORS } from '@/lib/mark_semantics';
import { parseMarkRef } from '@/lib/mark_ref';
import { refToChineseLabel } from '@/lib/ref_label';
import {
  clearHighlightForSelection,
  findHighlightStorageRef,
  getHighlightMap,
  highlightClass,
  markForVerse,
  pickHighlightColor,
  selectionRef as markSelectionRef,
  type HighlightColor,
} from '@/lib/reader_highlights';
import {
  addThought,
  listRefForVerse,
  myThoughtsForChapter,
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
  onNavigate,
  onPickBook,
  bookAbbr,
  renderVerseText,
  planMeta,
  onPlanMetaChange,
  onPlanJump,
  externalOverlayOpen = false,
  flashRef = null,
  checkinGroupId = null,
}: {
  book: BibleBook;
  books: BibleBook[];
  chapter: number;
  onNavigate: (book: BibleBook, chapter: number) => void;
  onPickBook: () => void;
  bookAbbr: (name: string) => string;
  renderVerseText: (text: string, keyBase: string) => React.ReactNode;
  planMeta?: PlanReadingMeta | null;
  onPlanMetaChange?: (m: PlanReadingMeta) => void;
  onPlanJump?: (bookId: string, chapter: number) => void;
  externalOverlayOpen?: boolean;
  flashRef?: string | null;
  checkinGroupId?: string | null;
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
  const [peekPrevVerses, setPeekPrevVerses] = useState<Verse[] | null>(null);
  const [peekNextVerses, setPeekNextVerses] = useState<Verse[] | null>(null);
  const [peekPrevBook, setPeekPrevBook] = useState<BibleBook | null>(null);
  const [peekNextBook, setPeekNextBook] = useState<BibleBook | null>(null);
  const [peekPrevChapter, setPeekPrevChapter] = useState(0);
  const [peekNextChapter, setPeekNextChapter] = useState(0);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [resumeFlashVerse, setResumeFlashVerse] = useState<number | null>(null);
  const [selectionSpan, setSelectionSpan] = useState<{ start: number; end: number } | null>(null);
  const [markNotePrompt, setMarkNotePrompt] = useState<null | { ref: string; label: string }>(null);
  const [bookDone, setBookDone] = useState(false);
  const [aiSheet, setAiSheet] = useState(false);
  const [bookCelebrate, setBookCelebrate] = useState(false);
  const [chapterBottomTick, setChapterBottomTick] = useState(0);
  const [viewNote, setViewNote] = useState<LocalNote | null>(null);
  const [summarySheet, setSummarySheet] = useState<null | { title: string; load: () => Promise<string> }>(null);
  const [chapterNotes, setChapterNotes] = useState<Map<number, LocalNote[]>>(new Map());
  const [highlightMap, setHighlightMap] = useState<ReturnType<typeof getHighlightMap>>({});
  const [writeThoughtSheet, setWriteThoughtSheet] = useState<null | {
    ref: string;
    label: string;
    verseText?: string;
  }>(null);
  const [thoughtListSheet, setThoughtListSheet] = useState<null | {
    ref: string;
    label: string;
    text: string;
    verse: number;
  }>(null);
  const [thoughtRevision, setThoughtRevision] = useState(0);
  const [groupCheckinOpen, setGroupCheckinOpen] = useState(false);
  const [planOverlayOpen, setPlanOverlayOpen] = useState(false);
  const [hasGroups, setHasGroups] = useState(false);
  const [groupCtx, setGroupCtx] = useState<{
    groupId?: string;
    taskId?: string;
    taskTitle?: string;
  }>({});
  const [underlinesOn, setUnderlinesOn] = useState(true);
  const [thoughtsOn, setThoughtsOn] = useState(true);
  const [fontFamily, setFontFamilyState] = useState<ReaderFontFamily>('serif');
  const [pageTurn, setPageTurnState] = useState<PageTurnMode>('swipe');
  const swipeTurn = pageTurn === 'swipe';
  const contentRef = useRef<HTMLDivElement>(null);
  const focusBarRef = useRef<HTMLDivElement>(null);
  const [focusBarStyle, setFocusBarStyle] = useState<React.CSSProperties>({});
  const lastScrollTop = useRef(0);
  const lastSelectAt = useRef(0);
  const syncingSelection = useRef(false);
  const readStartRef = useRef(Date.now());
  const readingEngagedRef = useRef(false);
  const skipResumeOnLoadRef = useRef(false);
  const overlayOpenRef = useRef(false);

  const overlayOpen = Boolean(
    externalOverlayOpen
    || planOverlayOpen
    || showSettings
    || showVersions
    || aiSheet
    || summarySheet
    || viewNote
    || writeThoughtSheet
    || thoughtListSheet
    || groupCheckinOpen
    || bookCelebrate,
  );
  overlayOpenRef.current = overlayOpen;

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

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') readerDwellPause();
      else readerDwellResume();
    };
    readerDwellResume();
    document.addEventListener('visibilitychange', onVis);
    const tick = window.setInterval(() => {
      readerDwellPause();
      readerDwellResume();
    }, 30000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(tick);
      readerDwellPause();
    };
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const groupId = p.get('group') || undefined;
    const taskId = p.get('task') || undefined;
    const taskTitle = p.get('taskTitle') || undefined;
    setGroupCtx({ groupId, taskId, taskTitle });
    if (groupId && taskId) setGroupCheckinOpen(true);
    api.myGroups()
      .then((r) => setHasGroups(r.groups.length > 0))
      .catch(() => setHasGroups(false));
  }, []);

  useEffect(() => {
    setBookDone(false);
  }, [book.id, chapter]);

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
  const myChapterThoughts = useMemo(
    () => (thoughtsOn ? myThoughtsForChapter(book.id, chapter) : {}),
    [book.id, chapter, thoughtsOn, thoughtRevision],
  );

  const selRef = useMemo(
    () => markSelectionRef(book.id, chapter, sortedSel, selectionSpan),
    [book.id, chapter, sortedSel, selectionSpan],
  );

  const currentMark = useMemo(() => {
    if (!selRef || !sortedSel.length) return null;
    const storageRef = findHighlightStorageRef(
      book.id,
      chapter,
      sortedSel,
      highlightMap,
      selectionSpan,
    );
    if (storageRef) return highlightMap[storageRef] ?? null;
    return highlightMap[selRef] ?? null;
  }, [highlightMap, selRef, book.id, chapter, sortedSel, selectionSpan]);

  const renderVerseBody = useCallback(
    (
      text: string,
      keyBase: string,
      flashLead: boolean,
      markInfo?: ReturnType<typeof markForVerse>,
    ) => {
      const span = markInfo?.span;
      const mark = markInfo?.mark ?? null;
      const renderText = (t: string, suffix: string) =>
        renderVerseText(t, `${keyBase}-${suffix}`);

      if (span && mark && span.end > span.start && span.start >= 0 && span.end <= text.length) {
        const before = text.slice(0, span.start);
        const mid = text.slice(span.start, span.end);
        const after = text.slice(span.end);
        return (
          <>
            {before ? renderText(before, 'pre') : null}
            <span className={`verse-mark-span ${highlightClass(mark)}${flashLead ? ' verse-mark-flash' : ''}`}>
              {renderText(mid, 'mid')}
            </span>
            {after ? renderText(after, 'post') : null}
          </>
        );
      }

      if (flashLead && text) {
        const lead = text.slice(0, 2);
        const tail = text.slice(2);
        return (
          <>
            <span className="verse-resume-lead-flash">{lead}</span>
            {tail ? renderText(tail, 'tail') : null}
          </>
        );
      }

      return renderVerseText(text, keyBase);
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
    const topReserve = chromeHidden ? 12 : 58;
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
    const refStr = listRefForVerse(book.id, chapter, verse);
    setThoughtListSheet({
      ref: refStr,
      label: `${bookAbbr(book.name)} ${chapter}:${verse}`,
      text,
      verse,
    });
  };

  const verseThoughtClass = (verse: number) => {
    if (!thoughtsOn || !(chapterThoughts[verse] ?? 0)) return '';
    return (myChapterThoughts[verse] ?? 0) > 0
      ? ' verse-has-thought verse-has-thought-mine'
      : ' verse-has-thought';
  };

  const handleVerseThoughtClick = (
    e: React.MouseEvent,
    verse: number,
    text: string,
  ) => {
    if (!thoughtsOn || !(chapterThoughts[verse] ?? 0)) return;
    e.stopPropagation();
    openThoughtListForVerse(verse, text);
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

  const applyMarkChoice = useCallback((color: HighlightColor) => {
    if (!underlinesOn) {
      setUnderlinesOn(true);
      persistUnderlinesOn(true);
    }
    const added = pickHighlightColor(book.id, chapter, sortedSel, color, selectionSpan);
    setHighlightMap(getHighlightMap());
    flashToast(added ? '已划线' : '已取消划线');
  }, [book.id, chapter, sortedSel, selectionSpan, underlinesOn]);

  const clearMark = useCallback(() => {
    const ok = clearHighlightForSelection(book.id, chapter, sortedSel, selectionSpan);
    if (!ok) return;
    setHighlightMap(getHighlightMap());
    flashToast('已取消划线');
  }, [book.id, chapter, sortedSel, selectionSpan]);

  const scrollToChapterStart = useCallback(() => {
    requestAnimationFrame(() => {
      if (contentRef.current) contentRef.current.scrollTop = 0;
    });
  }, []);

  const toggleChrome = useCallback(() => {
    if (overlayOpenRef.current) return;
    setChromeHidden((hidden) => !hidden);
  }, []);

  useEffect(() => {
    const bg = readerThemeBackground(theme);
    document.body.classList.add('reader-active');
    document.body.style.setProperty('--reader-surface-bg', bg);
    document.body.style.background = bg;
    document.documentElement.style.background = bg;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = meta?.getAttribute('content') ?? '';
    meta?.setAttribute('content', theme === 'night' ? '#12181c' : bg);
    return () => {
      document.body.classList.remove('reader-active', 'reader-immersive');
      document.body.style.removeProperty('--reader-surface-bg');
      document.body.style.background = '';
      document.documentElement.style.background = '';
      if (meta && prevTheme) meta.setAttribute('content', prevTheme);
    };
  }, [theme]);

  useEffect(() => {
    if (chromeHidden) document.body.classList.add('reader-immersive');
    else document.body.classList.remove('reader-immersive');
  }, [chromeHidden]);

  // 半屏面板打开时显示顶栏与底部 Tab。
  useEffect(() => {
    if (overlayOpen) setChromeHidden(false);
  }, [overlayOpen]);

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

  useEffect(() => {
    document.documentElement.style.setProperty('--assistant-answer-font-size', `${fontPx}px`);
  }, [fontPx]);

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

  const readerLocation = useMemo(() => ({ bookId: book.id, chapter }), [book.id, chapter]);

  const prefetchTarget = useCallback(
    (bookId: string, ch: number) => {
      void loadChapterVerses(bookId, ch, mainVersionId);
    },
    [mainVersionId],
  );

  useEffect(() => {
    if (!swipeTurn) return;
    let cancelled = false;
    const prev = resolveChapterNav(books, readerLocation, -1);
    const next = resolveChapterNav(books, readerLocation, 1);
    setPeekPrevBook(prev?.book ?? null);
    setPeekNextBook(next?.book ?? null);
    setPeekPrevChapter(prev?.chapter ?? 0);
    setPeekNextChapter(next?.chapter ?? 0);

    const hydratePeek = async (target: ReturnType<typeof resolveChapterNav>, setter: (v: Verse[] | null) => void) => {
      if (!target) {
        setter(null);
        return;
      }
      const sync = getChapterVersesSync(target.book.id, target.chapter, mainVersionId);
      if (sync?.length) {
        setter(sync);
        return;
      }
      const loaded = await loadChapterVerses(target.book.id, target.chapter, mainVersionId);
      if (!cancelled) setter(loaded);
    };

    void hydratePeek(prev, setPeekPrevVerses);
    void hydratePeek(next, setPeekNextVerses);
    prefetchReaderVicinity(books, book, chapter, mainVersionId, prefetchTarget, 2);
    return () => {
      cancelled = true;
    };
  }, [books, book, chapter, mainVersionId, swipeTurn, readerLocation, prefetchTarget]);

  useEffect(() => {
    setSelected([]);
    setBookDone(false);
    readStartRef.current = Date.now();
    readingEngagedRef.current = false;
    cancelPendingChapterProgress();
    setChapterAnim(swipeTurn ? '' : 'chapter-enter');

    const version = chapterCacheVersion(mainVersionId);
    const cached = getCachedChapter(book.id, chapter, version);
    const hasCached = Boolean(cached?.length);
    if (hasCached && cached) {
      setLayoutVerses(cached);
      setVerses(cached);
      setChapterLoading(false);
    } else if (!swipeTurn) {
      setChapterLoading(true);
    }

    prefetchReaderVicinity(books, book, chapter, mainVersionId, prefetchTarget, 2);

    let cancelled = false;
    const load = async () => {
      try {
        const chineseVerses = hasCached
          ? cached!
          : await loadChapterVerses(book.id, chapter);
        if (cancelled || !chineseVerses) {
          if (!cancelled) {
            if (!chineseVerses) flashToast('加载失败');
            setChapterLoading(false);
          }
          return;
        }
        setLayoutVerses(chineseVerses);
        if (mainVersionId) {
          const altVerses = await loadChapterVerses(book.id, chapter, mainVersionId);
          if (cancelled) return;
          setVerses(altVerses ?? chineseVerses);
        } else {
          setVerses(chineseVerses);
        }
        setChapterLoading(false);
        scheduleChapterProgress(book.id, chapter, false, () => {
          maybeNotifyBookComplete(book.id, book.name, book.chapter_count);
        });
        setLastRead(book.id, chapter);

        requestAnimationFrame(() => {
          if (contentRef.current) contentRef.current.scrollTop = 0;
          const flashParsed = flashRef ? parseMarkRef(flashRef) : null;
          const flashVerse =
            flashParsed &&
            flashParsed.bookId === book.id &&
            flashParsed.chapter === chapter
              ? flashParsed.verseStart ?? null
              : null;
          if (flashVerse) {
            document.getElementById(`verse-anchor-${flashVerse}`)?.scrollIntoView({
              behavior: 'auto',
              block: 'center',
            });
            setResumeFlashVerse(flashVerse);
            window.setTimeout(() => setResumeFlashVerse(null), 2600);
            return;
          }
          if (skipResumeOnLoadRef.current) {
            skipResumeOnLoadRef.current = false;
            return;
          }
          const lastV = getLastReadVerse(book.id, chapter);
          const last = getLastRead();
          if (last && last.bookId === book.id && last.chapter === chapter && lastV && shouldShowResumeHint()) {
            document.getElementById(`verse-anchor-${lastV}`)?.scrollIntoView({ behavior: 'auto', block: 'start' });
            setResumeFlashVerse(lastV);
            window.setTimeout(() => setResumeFlashVerse(null), 2600);
          }
        });
      } catch {
        if (!cancelled) flashToast('加载失败');
      } finally {
        if (!cancelled) setChapterLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      cancelPendingChapterProgress();
    };
  }, [book, chapter, mainVersionId, bookAbbr, flashRef, swipeTurn, books, prefetchTarget]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      if (overlayOpenRef.current) {
        lastScrollTop.current = el.scrollTop;
        return;
      }
      const cur = el.scrollTop;
      if (cur > lastScrollTop.current + 6) {
        readingEngagedRef.current = true;
        confirmChapterProgress(book.id, chapter, () => {
          maybeNotifyBookComplete(book.id, book.name, book.chapter_count);
        });
      } else if (cur < lastScrollTop.current - 6) {
        readingEngagedRef.current = true;
        confirmChapterProgress(book.id, chapter, () => {
          maybeNotifyBookComplete(book.id, book.name, book.chapter_count);
        });
      }
      lastScrollTop.current = cur;

      const mid = el.scrollTop + el.clientHeight * 0.35;
      const bottom = el.scrollTop + el.clientHeight;
      let bestVerse: number | null = null;
      let bestDist = Infinity;
      let maxPassed = 0;
      for (const v of verses) {
        const anchor = document.getElementById(`verse-anchor-${v.verse}`);
        if (!anchor) continue;
        const top = anchor.offsetTop;
        if (top <= bottom) maxPassed = Math.max(maxPassed, v.verse);
        const dist = Math.abs(top - mid);
        if (dist < bestDist) {
          bestDist = dist;
          bestVerse = v.verse;
        }
      }
      const progressVerse = maxPassed || bestVerse;
      if (progressVerse != null) setLastReadVerse(book.id, chapter, progressVerse);

      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (nearBottom && verses.length > 0) {
        setChapterBottomTick((t) => t + 1);
      }
      if (bookDone) return;
      if (chapter < book.chapter_count) return;
      if (nearBottom && verses.length > 0) {
        setBookDone(true);
        setBookCelebrate(true);
        flashToast(`🎉 恭喜读完《${book.name}》`);
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, [verses, bookDone, chapter, book.chapter_count, book.name, book.id]);

  useEffect(() => {
    if (!bookCelebrate) return;
    const timer = window.setTimeout(() => setBookCelebrate(false), 4200);
    return () => window.clearTimeout(timer);
  }, [bookCelebrate]);

  const navigateByDelta = useCallback(
    (delta: number) => {
      const target = resolveChapterNav(books, readerLocation, delta);
      if (!target) return;
      const peek = delta > 0 ? peekNextVerses : delta < 0 ? peekPrevVerses : null;
      const version = chapterCacheVersion(mainVersionId);
      const cached = getCachedChapter(target.book.id, target.chapter, version);
      const instant = peek?.length ? peek : cached ?? getChapterVersesSync(target.book.id, target.chapter, mainVersionId);
      if (instant?.length) {
        setLayoutVerses(instant);
        setVerses(instant);
        setChapterLoading(false);
        if (!cached?.length) {
          setCachedChapter(target.book.id, target.chapter, instant, version);
        }
      } else if (swipeTurn) {
        setChapterLoading(true);
      }
      readingEngagedRef.current = true;
      skipResumeOnLoadRef.current = true;
      scrollToChapterStart();
      onNavigate(target.book, target.chapter);
    },
    [
      books,
      readerLocation,
      peekNextVerses,
      peekPrevVerses,
      mainVersionId,
      swipeTurn,
      scrollToChapterStart,
      onNavigate,
    ],
  );

  const navChapter = (delta: number) => {
    if (pageTurn === 'swipe') {
      navigateByDelta(delta);
      return;
    }
    readingEngagedRef.current = true;
    skipResumeOnLoadRef.current = true;
    setChapterAnim(delta > 0 ? 'chapter-exit-left' : 'chapter-exit-right');
    setTimeout(() => {
      navigateByDelta(delta);
      setChapterAnim(swipeTurn ? '' : 'chapter-enter');
    }, 180);
  };

  const turn = useReaderPageTurn({
    enabled: swipeTurn,
    canPrev: canNavigateChapter(books, readerLocation, -1),
    canNext: canNavigateChapter(books, readerLocation, 1),
    blocked: overlayOpen || hasSel,
    onChapterChange: navigateByDelta,
    onDragApproach: (delta) => {
      const target = resolveChapterNav(books, readerLocation, delta);
      if (!target) return;
      void loadChapterVerses(target.book.id, target.chapter, mainVersionId);
    },
  });

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
    let span: { start: number; end: number } | null = null;
    if (lo === hi) {
      const verseText = verses.find((v) => v.verse === lo)?.text ?? '';
      const picked = sel.toString().replace(/\s+/g, ' ').trim();
      const normalized = verseText.replace(/\s+/g, ' ').trim();
      if (picked && picked.length < normalized.length) {
        const start = normalized.indexOf(picked);
        if (start >= 0) span = { start, end: start + picked.length };
      }
    }
    syncingSelection.current = true;
    setSelected(next);
    setSelectionSpan(span);
    setLastReadVerse(book.id, chapter, hi);
    lastSelectAt.current = Date.now();
    logVerseRead(`${book.id}.${chapter}.${hi}`);
    readingEngagedRef.current = true;
    syncingSelection.current = false;
  }, [book.id, chapter, verses]);

  useEffect(() => {
    const onSel = () => syncSelectionFromDom();
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [syncSelectionFromDom]);

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelected([]);
    setSelectionSpan(null);
  };

  useEffect(() => {
    if (!hasSel) setMarkNotePrompt(null);
  }, [hasSel]);

  const renderPlanLayer = () => (
    planMeta && onPlanMetaChange && onPlanJump ? (
      <PlanReadingLayer
        meta={planMeta}
        bookId={book.id}
        chapter={chapter}
        chapterBottomTick={chapterBottomTick}
        checkinGroupId={checkinGroupId ?? groupCtx.groupId}
        onMetaChange={onPlanMetaChange}
        onJump={onPlanJump}
        onOverlayChange={setPlanOverlayOpen}
      />
    ) : null
  );

  const renderChapterHead = () => (
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
  );

  const renderChapterVerses = () => (
    <>
      {verses.length === 0 && chapterLoading ? (
        <ReaderSkeleton />
      ) : verses.length === 0 ? null : layout === 'parallel' && !mainVersionId && parallelVerses.length > 0 ? (
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
                      const markInfo = underlinesOn
                        ? markForVerse(highlightMap, book.id, chapter, v.verse)
                        : null;
                      const wholeMark = markInfo && !markInfo.span ? markInfo.mark : null;
                      return (
                        <span
                          key={v.verse}
                          id={`verse-anchor-${v.verse}`}
                          className={`verse-inline verse-token ${highlightClass(wholeMark)}${verseThoughtClass(v.verse)}`}
                          onClick={(e) => handleVerseThoughtClick(e, v.verse, text)}
                        >
                          {verseNo !== 'hidden' && (
                            <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
                          )}
                          {renderVerseBody(
                            text,
                            `p${v.verse}`,
                            resumeFlashVerse === v.verse,
                            markInfo ?? undefined,
                          )}
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
                  const markInfo = underlinesOn
                    ? markForVerse(highlightMap, book.id, chapter, v.verse)
                    : null;
                  const wholeMark = markInfo && !markInfo.span ? markInfo.mark : null;
                  return (
                    <span
                      key={v.verse}
                      id={`verse-anchor-${v.verse}`}
                      className={`verse-inline verse-token ${highlightClass(wholeMark)}${verseThoughtClass(v.verse)}`}
                      onClick={(e) => handleVerseThoughtClick(e, v.verse, verseDisplayText(v.verse, v.text))}
                    >
                      {verseNo !== 'hidden' && (
                        <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
                      )}
                      {renderVerseBody(
                        verseDisplayText(v.verse, v.text),
                        `v${v.verse}`,
                        resumeFlashVerse === v.verse,
                        markInfo ?? undefined,
                      )}
                      {renderNotePin(v.verse)}{' '}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </>
  );

  return (
    <main
      className={`container reader-page reader-theme-${theme} ${poetry ? 'reader-poetry' : 'reader-prose'}${chromeHidden ? ' reader-chrome-hidden' : ''}`}
      onClick={() => {
        // 忽略长按/双击后的余波点击，避免立即取消选中。
        if (Date.now() - lastSelectAt.current < 500) return;
        if (overlayOpen) return;
        if (viewNote) {
          setViewNote(null);
          return;
        }
        if (hasSel) {
          clearSelection();
          return;
        }
        toggleChrome();
      }}
    >
      <div className="reader-topbar" aria-hidden={chromeHidden}>
        <div className="reader-topbar-left">
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
          <Link
            href="/search?from=/reader"
            className="reader-icon-btn"
            aria-label="搜索"
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
          </Link>
          <button type="button" className="reader-more" onClick={(e) => { e.stopPropagation(); setShowSettings(true); }} aria-label="阅读设置">
            ⋮
          </button>
        </div>
      </div>

      <div className="reader-body">
        {renderPlanLayer()}
        {renderChapterHead()}

        <div
          className={`reader-content ${chapterAnim}${swipeTurn ? ' reader-content-turn' : ''}`}
          onContextMenu={(e) => e.preventDefault()}
        >
          {swipeTurn ? (
            <div
              className="reader-turn-viewport"
              ref={turn.viewportRef}
              onTouchStart={turn.onTouchStart}
              onTouchMove={turn.onTouchMove}
              onTouchEnd={turn.onTouchEnd}
              onTouchCancel={turn.onTouchCancel}
            >
              <div className="reader-turn-track" style={turn.trackStyle}>
                <div className="reader-turn-panel reader-turn-panel-peek" aria-hidden>
                  <ReaderChapterPeek
                    bookId={peekPrevBook?.id ?? book.id}
                    bookName={peekPrevBook?.name ?? book.name}
                    bookAbbr={bookAbbr}
                    chapter={peekPrevChapter}
                    verses={peekPrevVerses}
                    englishUI={englishUI}
                    fontPx={fontPx}
                    fontFamilyCss={fontFamilyCss(fontFamily)}
                    verseNo={verseNo}
                    hideHead
                  />
                </div>
                <div ref={contentRef} className="reader-turn-panel reader-turn-panel-active">
                  {renderChapterVerses()}
                </div>
                <div className="reader-turn-panel reader-turn-panel-peek" aria-hidden>
                  <ReaderChapterPeek
                    bookId={peekNextBook?.id ?? book.id}
                    bookName={peekNextBook?.name ?? book.name}
                    bookAbbr={bookAbbr}
                    chapter={peekNextChapter}
                    verses={peekNextVerses}
                    englishUI={englishUI}
                    fontPx={fontPx}
                    fontFamilyCss={fontFamilyCss(fontFamily)}
                    verseNo={verseNo}
                    hideHead
                  />
                </div>
              </div>
            </div>
          ) : (
            <div ref={contentRef} className="reader-scroll-panel">
              {renderChapterVerses()}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className={`reader-fab${chromeHidden || hasSel ? ' is-hidden' : ''}`}
        onClick={(e) => { e.stopPropagation(); setAiSheet(true); }}
        aria-label="问小爱"
        aria-hidden={chromeHidden || hasSel}
      >
        ✦ 小爱
      </button>

      {hasGroups && (
      <button
        type="button"
        className={`reader-fab reader-fab-group reader-fab-sm${chromeHidden || hasSel ? ' is-hidden' : ''}`}
        onClick={(e) => { e.stopPropagation(); setGroupCheckinOpen(true); }}
        aria-label="打卡到共读群"
        aria-hidden={chromeHidden || hasSel}
      >
        {groupCtx.groupId ? '打卡到群' : '打卡'}
      </button>
      )}

      {hasSel && (
        <div
          ref={focusBarRef}
          className="reader-focus-bar reader-focus-bar-ext reader-focus-bar-near"
          style={focusBarStyle}
          onClick={(e) => e.stopPropagation()}
        >
          {underlinesOn && (
            <div className="reader-focus-row reader-focus-row-mark">
              {MARK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`reader-weread-dot reader-mark-dot-${c} ${currentMark?.color === c ? 'reader-weread-dot-active' : ''}`}
                  title={MARK_COLOR_SEMANTICS[c].label}
                  aria-label={MARK_COLOR_SEMANTICS[c].label}
                  onClick={() => applyMarkChoice(c)}
                />
              ))}
              {currentMark && (
                <button type="button" className="vsb-item" onClick={clearMark}>清除</button>
              )}
            </div>
          )}
          <div className="reader-focus-row reader-focus-row-actions">
            <button
              type="button"
              className="vsb-item"
              onClick={() => {
                setMarkNotePrompt({ ref: selRef, label: effRefLabel });
              }}
            >
              笔记
            </button>
            {thoughtsOn && (
              <button type="button" className="vsb-item" onClick={() => {
                setWriteThoughtSheet({
                  ref: selRef,
                  label: effRefLabel,
                  verseText: effSelectionText || undefined,
                });
                clearSelection();
              }}>想法</button>
            )}
            <button type="button" className="vsb-item" onClick={() => { navigator.clipboard.writeText(`${effRefLabel} ${effSelectionText}`); flashToast(englishUI ? 'Copied' : '已复制'); }}>{ui.copy}</button>
            <button type="button" className="vsb-item" onClick={() => setAiSheet(true)}>{ui.askAi}</button>
          </div>
        </div>
      )}

      {markNotePrompt && (
        <MarkNoteBar
          refStr={markNotePrompt.ref}
          refLabel={markNotePrompt.label}
          onSaved={() => flashToast('笔记已保存')}
          onDismiss={() => setMarkNotePrompt(null)}
        />
      )}

      {writeThoughtSheet && (
        <ThoughtWriteSheet
          refLabel={writeThoughtSheet.label}
          verseText={writeThoughtSheet.verseText}
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
          bookId={book.id}
          chapter={chapter}
          verse={thoughtListSheet.verse}
          onChanged={() => setThoughtRevision((n) => n + 1)}
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

      {bookCelebrate && (
        <div className="book-complete-overlay" onClick={() => setBookCelebrate(false)}>
          <div className="book-complete-card">
            <span className="book-complete-icon">📖</span>
            <strong>读完 {book.name}！</strong>
            <p className="muted">愿话语继续在你心里动工</p>
          </div>
        </div>
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
              {viewNote.ref && (
                <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  {refToChineseLabel(viewNote.ref) ?? viewNote.ref}
                </p>
              )}
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

      {groupCheckinOpen && (
        <GroupCheckinSheet
          bookId={book.id}
          bookName={book.name}
          chapter={chapter}
          presetGroupId={groupCtx.groupId}
          presetTaskId={groupCtx.taskId}
          presetTaskTitle={groupCtx.taskTitle}
          onClose={() => setGroupCheckinOpen(false)}
          onDone={() => flashToast(englishUI ? 'Shared to group' : '已分享到共读群')}
        />
      )}
    </main>
  );
}
