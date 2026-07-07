'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import {
  api,
  type BibleBook,
  type BibleVersion,
  type Verse,
} from '@/lib/api';
import XiaoAiSheet from '@/components/reader/XiaoAiSheet';
import { useToast } from '@/components/ui/ToastProvider';
import PageBackBar from '@/components/PageBackBar';
import SummarySheet from '@/components/reader/SummarySheet';
import { ReaderToolsSheet } from '@/components/reader/ReaderToolsSheet';
import { SectionTitle } from '@/components/reader/SectionTitle';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import ThoughtHubSheet from '@/components/reader/ThoughtHubSheet';
import ReaderSheetPortal from '@/components/reader/ReaderSheetPortal';
import ThoughtWriteSheet from '@/components/reader/ThoughtWriteSheet';
import GroupCheckinSheet from '@/components/group/GroupCheckinSheet';
import { getCachedChapter, setCachedChapter } from '@/lib/chapter_cache';
import {
  chapterCacheVersion,
  getChapterVersesSync,
  loadChapterVerses,
} from '@/lib/chapter_prefetch';
import { bibleChapter } from '@/lib/bible_client';
import {
  canPlanNav,
  resolvePlanNav,
  type PlanNavGuard,
} from '@/lib/plan_navigation';
import {
  canNavigateChapter,
  prefetchReaderVicinity,
  resolveChapterNav,
} from '@/lib/reader_navigation';
import {
  type ChapterReaderBundle,
  loadChapterReaderBundle,
  prefetchChapterReaderBundle,
  prefetchReaderVicinityBundles,
} from '@/lib/chapter_reader_bundle';
import {
  addThought,
  getDefaultVisibility,
  listRefForVerse,
  myThoughtsForChapter,
  myThoughtsForRef,
  selectionRef,
  thoughtsForChapter,
  updateThought,
  type ThoughtVisibility,
} from '@/lib/reader_thoughts';
import {
  getParallelVersion,
  getMainVersion,
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
import { centerVerseInScroll, sectionRangeForVerse } from '@/lib/reader_viewport';
import { sliceVerseWords } from '@/lib/verse_words';
import {
  textFromWordRange,
  wordOverlapsRange,
  wordRangeToSpan,
  wordRangesEqual,
  wordSelectionEdge,
  type WordAnchor,
  type WordRange,
} from '@/lib/selection_range';
import { isTouchPrimaryUI } from '@/lib/touch_ui';
import {
  readNativePinnedHighlight,
  readNativeVerseSelection,
  type NativePinnedHighlight,
  type NativeVerseSelection,
} from '@/lib/native_verse_selection';
import {
  applyNativePinnedHighlight,
  clearNativePinnedHighlight,
  supportsCssCustomHighlight,
} from '@/lib/native_verse_highlight';
import {
  cancelPendingChapterProgress,
  confirmChapterProgress,
  logChapterDetail,
  scheduleChapterProgress,
  logVerseRead,
  noteChapterVerseTouch,
  maybeNotifyBookComplete,
  readerDwellPause,
  readerDwellResume,
  setLastRead,
  getLastRead,
  getLastReadVerse,
  setLastReadVerse,
  shouldShowResumeHint,
} from '@/lib/reading';
import { recordParallelChapter } from '@/lib/badge_events';
import { outlineFor, outlineForAsync, preloadSectionTitles, type SectionMark } from '@/lib/section_titles';
import { resolveSelectionTextForAi, versesForNativeLineHighlight, nativeSelectionCoversVerses } from '@/lib/reader_selection_text';
import { groupVersesIntoParagraphs, isPoetryBook } from '@/lib/paragraphs';
import { buildCheckinRef } from '@/lib/group_checkin';
import { saveGroupCheckinDraft } from '@/lib/group_checkin_draft';
import {
  clearReaderReturnHref,
  getReaderReturnHref,
  readerBackHref,
} from '@/lib/reader_return';
import { clearReaderChrome } from '@/lib/reader_chrome';
import {
  applyAppTheme,
  getEffectiveReaderTheme,
  getReaderFollowApp,
  setReaderFollowApp,
} from '@/lib/app_theme';
import PlanReadingLayer from '@/components/reader/PlanReadingLayer';
import ReaderChapterPeek from '@/components/reader/ReaderChapterPeek';
import { ReaderLocPopover } from '@/components/reader/ReaderLocPopover';
import { useReaderPageTurn } from '@/components/reader/useReaderPageTurn';
import { buildPlanReadingMeta, type PlanReadingMeta } from '@/lib/plan_reading';
import { getActivePlan } from '@/lib/plan_progress';
import { readerUi } from '@/lib/reader_i18n';
import { ReaderSkeleton } from '@/components/Skeleton';
import { MARK_COLOR_SEMANTICS, MARK_COLORS } from '@/lib/mark_semantics';
import { parseMarkRef } from '@/lib/mark_ref';
import { feedHintMessage, type FeedActivityHint } from '@/lib/feed_activity';
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
  { label: '中', px: 18 },
  { label: '大', px: 20 },
  { label: '特大', px: 24 },
];
const DEFAULT_FONT_PX = 18;

export default function ReaderView({
  book,
  books,
  chapter,
  onNavigate,
  bookAbbr,
  renderVerseText,
  planMeta,
  onPlanMetaChange,
  onPlanJump,
  onPlanExit,
  externalOverlayOpen = false,
  flashRef = null,
  feedHint = null,
  checkinGroupId = null,
  paneActive = true,
}: {
  book: BibleBook;
  books: BibleBook[];
  chapter: number;
  onNavigate: (book: BibleBook, chapter: number) => void;
  bookAbbr: (name: string) => string;
  renderVerseText: (text: string, keyBase: string, verse: number) => React.ReactNode;
  planMeta?: PlanReadingMeta | null;
  onPlanMetaChange?: (m: PlanReadingMeta) => void;
  onPlanJump?: (bookId: string, chapter: number) => void;
  onPlanExit?: () => void;
  externalOverlayOpen?: boolean;
  flashRef?: string | null;
  feedHint?: FeedActivityHint | null;
  checkinGroupId?: string | null;
  paneActive?: boolean;
}) {
  const flashToast = useToast();
  const [verses, setVerses] = useState<Verse[]>([]);
  /** 中文和合本结构，用于段落断点（KJV 单栏/对照时与中文段落对齐）。 */
  const [layoutVerses, setLayoutVerses] = useState<Verse[]>([]);
  const [parallelVerses, setParallelVerses] = useState<Verse[]>([]);
  const [wholeVerseSel, setWholeVerseSel] = useState<number[]>([]);
  const [versionLabel, setVersionLabel] = useState('和合本');
  const [fontPx, setFontPx] = useState(DEFAULT_FONT_PX);
  const [showSettings, setShowSettings] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [checkedVers, setCheckedVers] = useState<string[]>(['cnv']);
  const [versions, setVersions] = useState<BibleVersion[] | null>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [theme, setTheme] = useState<ReaderTheme>('morning');
  const [verseNo, setVerseNo] = useState<VerseNumberMode>('inline');
  const [layout, setLayout] = useState<ReadingLayout>('single');
  const [parallelVer, setParallelVer] = useState('kjv');
  const [mainVersionId, setMainVersionId] = useState<string | null>(null);
  const [chapterAnim, setChapterAnim] = useState('');
  const [verseTransitionOff, setVerseTransitionOff] = useState(false);
  const [peekPrevBundle, setPeekPrevBundle] = useState<ChapterReaderBundle | null>(null);
  const [peekNextBundle, setPeekNextBundle] = useState<ChapterReaderBundle | null>(null);
  const [peekPrevBook, setPeekPrevBook] = useState<BibleBook | null>(null);
  const [peekNextBook, setPeekNextBook] = useState<BibleBook | null>(null);
  const [peekPrevChapter, setPeekPrevChapter] = useState(0);
  const [peekNextChapter, setPeekNextChapter] = useState(0);
  const peekFrozenRef = useRef(false);
  const pendingPeekRef = useRef<{ prev: ChapterReaderBundle | null; next: ChapterReaderBundle | null }>({
    prev: null,
    next: null,
  });
  const [chapterLoading, setChapterLoading] = useState(false);
  const [resumeFlashVerse, setResumeFlashVerse] = useState<number | null>(null);
  const [feedHintDismissed, setFeedHintDismissed] = useState(false);

  const feedHintVerse = useMemo(() => {
    if (!feedHint || !flashRef) return null;
    const parsed = parseMarkRef(flashRef);
    if (!parsed || parsed.bookId !== book.id || parsed.chapter !== chapter) return null;
    return parsed.verseStart ?? null;
  }, [feedHint, flashRef, book.id, chapter]);

  useEffect(() => {
    setFeedHintDismissed(false);
    if (!feedHint) return undefined;
    const t = window.setTimeout(() => setFeedHintDismissed(true), 8000);
    return () => window.clearTimeout(t);
  }, [feedHint, flashRef]);
  const [wordRange, setWordRange] = useState<WordRange | null>(null);
  const [nativeSelection, setNativeSelection] = useState<NativeVerseSelection | null>(null);
  const [nativePinnedHighlight, setNativePinnedHighlight] = useState<NativePinnedHighlight | null>(null);
  const [liveNativeSelection, setLiveNativeSelection] = useState<NativeVerseSelection | null>(null);
  const [nativeSelecting, setNativeSelecting] = useState(false);
  const nativeSelectingRef = useRef(false);
  const nativePinnedHighlightRef = useRef<NativePinnedHighlight | null>(null);
  const nativePinGenRef = useRef(0);
  const nativeTouchSelect = isTouchPrimaryUI();
  const [markPaletteOpen, setMarkPaletteOpen] = useState(false);
  const [bookDone, setBookDone] = useState(false);
  const [aiSheet, setAiSheet] = useState(false);
  const [toolsSheet, setToolsSheet] = useState<null | {
    tab: 'crossrefs' | 'guide';
    refParam: string;
    refLabel: string;
    sourceText?: string;
  }>(null);
  const [versePreview, setVersePreview] = useState<null | { osis: string; label: string }>(null);
  const [parallelLoading, setParallelLoading] = useState(false);
  const [parallelError, setParallelError] = useState<string | null>(null);
  const [versionBanner, setVersionBanner] = useState<string | null>(null);
  const [bookCelebrate, setBookCelebrate] = useState(false);
  const [chapterBottomTick, setChapterBottomTick] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [locPopoverOpen, setLocPopoverOpen] = useState(false);
  const locBtnRef = useRef<HTMLButtonElement>(null);
  const [highlightMap, setHighlightMap] = useState<ReturnType<typeof getHighlightMap>>({});
  const [thoughtHub, setThoughtHub] = useState<null | {
    ref: string;
    label: string;
    text: string;
    verse: number;
  }>(null);
  const [thoughtWrite, setThoughtWrite] = useState<null | {
    mode: 'new' | 'edit';
    ref: string;
    label: string;
    verseText?: string;
    thoughtId?: string;
    initialBody?: string;
    initialVisibility?: ThoughtVisibility;
    returnHub?: {
      ref: string;
      label: string;
      text: string;
      verse: number;
    };
  }>(null);
  const [thoughtRevision, setThoughtRevision] = useState(0);
  const [groupCheckinOpen, setGroupCheckinOpen] = useState(false);
  const [planOverlayOpen, setPlanOverlayOpen] = useState(false);
  const planNavGuardRef = useRef<PlanNavGuard | null>(null);
  const bindPlanNavGuard = useCallback((guard: PlanNavGuard | null) => {
    planNavGuardRef.current = guard;
  }, []);
  const [hasGroups, setHasGroups] = useState(false);
  const [groupCtx, setGroupCtx] = useState<{
    groupId?: string;
    taskId?: string;
    taskTitle?: string;
  }>({});
  const [backHref, setBackHref] = useState<string | null>(null);
  const [readerFollow, setReaderFollow] = useState(false);
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
  const [viewportCenterVerse, setViewportCenterVerse] = useState<number | null>(null);
  const [aiSheetContext, setAiSheetContext] = useState<null | {
    refParam: string;
    refLabel: string;
    selectionText: string;
  }>(null);
  const readStartRef = useRef(Date.now());
  const readingEngagedRef = useRef(false);
  const skipResumeOnLoadRef = useRef(false);
  /** 横滑松手后 applyNavigate 已灌入经文，章 effect 跳过重复加载 */
  const skipChapterHydrateRef = useRef(false);
  const overlayOpenRef = useRef(false);
  /** 划词结束后短时忽略横滑 */
  const swipeIgnoreUntilRef = useRef(0);
  const applyWordRangeRef = useRef<
    (anchor: WordAnchor, focus: WordAnchor, opts?: { commit?: boolean }) => void
  >(() => {});
  const wordRangeRef = useRef<WordRange | null>(null);
  const wordDragRafRef = useRef(0);
  const wordDragPendingRef = useRef<WordRange | null>(null);
  /** 点「问小爱」时锁定选区文本，避免 iOS selectionchange 截断 */
  const selectionPinRef = useRef('');

  const overlayOpen = Boolean(
    externalOverlayOpen
    || planOverlayOpen
    || showSettings
    || showVersions
    || aiSheet
    || summaryOpen
    || locPopoverOpen
    || thoughtHub
    || thoughtWrite
    || toolsSheet
    || groupCheckinOpen
    || bookCelebrate,
  );
  overlayOpenRef.current = overlayOpen;

  useEffect(() => {
    setHighlightMap(getHighlightMap());
    setUnderlinesOn(getUnderlinesOn());
    setThoughtsOn(getThoughtsOn());
  }, [book.id, chapter]);

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
    const groupId = p.get('group') || checkinGroupId || undefined;
    const taskId = p.get('task') || undefined;
    const taskTitle = p.get('taskTitle') || undefined;
    setGroupCtx({ groupId, taskId, taskTitle });
    if (groupId && taskId) setGroupCheckinOpen(true);
    setBackHref(getReaderReturnHref());
    setReaderFollow(getReaderFollowApp());
    api.myGroups()
      .then((r) => setHasGroups(r.groups.length > 0))
      .catch(() => setHasGroups(false));
  }, [checkinGroupId]);

  useEffect(() => {
    const gid = groupCtx.groupId || checkinGroupId;
    if (!gid) return;
    const save = () => {
      saveGroupCheckinDraft(gid, buildCheckinRef(book.id, chapter));
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      save();
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [book.id, chapter, groupCtx.groupId, checkinGroupId]);

  useEffect(() => {
    setBookDone(false);
  }, [book.id, chapter]);

  const poetry = isPoetryBook(book.id);
  const [outline, setOutline] = useState<SectionMark[]>([]);

  useEffect(() => {
    if (skipChapterHydrateRef.current) return;
    let cancelled = false;
    void outlineForAsync(book.id, chapter).then((marks) => {
      if (!cancelled) setOutline(marks);
    });
    return () => {
      cancelled = true;
    };
  }, [book.id, chapter]);
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

  const activeNativeSelection = nativeSelecting ? liveNativeSelection : nativeSelection;

  const sortedSel = useMemo(() => {
    if (wordRange) return [...wordRangeToSpan(wordRange).verses].sort((a, b) => a - b);
    if (nativeTouchSelect && activeNativeSelection?.verses.length) {
      return [...activeNativeSelection.verses].sort((a, b) => a - b);
    }
    return [...wholeVerseSel].sort((a, b) => a - b);
  }, [wordRange, wholeVerseSel, nativeTouchSelect, activeNativeSelection]);
  const nativeSelVerses = useMemo(
    () => (
      nativeTouchSelect && !nativeSelecting && !nativePinnedHighlight?.spans.length
        ? versesForNativeLineHighlight(verses, nativeSelection)
        : new Set<number>()
    ),
    [nativeTouchSelect, nativeSelection, nativeSelecting, nativePinnedHighlight, verses],
  );
  const verseSelClass = useCallback(
    (verse: number) => (wholeVerseSel.includes(verse) || nativeSelVerses.has(verse) ? ' verse-sel-active' : ''),
    [wholeVerseSel, nativeSelVerses],
  );
  const hasSel = sortedSel.length > 0;
  const selectionSpan = useMemo(
    () => (wordRange ? wordRangeToSpan(wordRange).span : null),
    [wordRange],
  );
  const minV = sortedSel[0];
  const maxV = sortedSel[sortedSel.length - 1];
  const selectionText = useMemo(
    () =>
      resolveSelectionTextForAi({
        verses,
        wholeVerseSel,
        wordRange,
        nativeTouchSelect,
        nativeSelection: activeNativeSelection,
      }),
    [verses, wholeVerseSel, wordRange, nativeTouchSelect, activeNativeSelection],
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

  const resolveAiSheetContext = useCallback(() => {
    if (hasSel) {
      return {
        refParam: effRefParam,
        refLabel: effRefLabel,
        selectionText: effSelectionText,
      };
    }
    const verseNums = verses.map((v) => v.verse);
    const centerV =
      viewportCenterVerse
      ?? (contentRef.current ? centerVerseInScroll(contentRef.current, verseNums) : null)
      ?? getLastReadVerse(book.id, chapter)
      ?? verses[0]?.verse
      ?? 1;
    const para = sectionRangeForVerse(
      outline,
      centerV,
      verses[verses.length - 1]?.verse ?? centerV,
    );
    const minV = para.start;
    const maxV = para.end;
    const picked = verses
      .filter((v) => v.verse >= minV && v.verse <= maxV)
      .sort((a, b) => a.verse - b.verse);
    const text = picked.map((v) => v.text).join('');
    const refParam =
      minV === maxV
        ? `${book.id}.${chapter}.${minV}`
        : `${book.id}.${chapter}.${minV}-${maxV}`;
    const refLabel =
      minV === maxV
        ? `${bookAbbr(book.name)} ${chapter}:${minV}`
        : `${bookAbbr(book.name)} ${chapter}:${minV}-${maxV}`;
    return { refParam, refLabel, selectionText: text };
  }, [
    hasSel,
    effRefParam,
    effRefLabel,
    effSelectionText,
    viewportCenterVerse,
    outline,
    book.id,
    book.name,
    chapter,
    verses,
    bookAbbr,
  ]);

  const openAiSheet = useCallback(() => {
    setAiSheetContext(resolveAiSheetContext());
    setAiSheet(true);
  }, [resolveAiSheetContext]);

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
      verseNum: number,
      flashLead: boolean,
      markInfo?: ReturnType<typeof markForVerse>,
    ) => {
      const span = markInfo?.span;
      const mark = markInfo?.mark ?? null;
      const renderText = (t: string, suffix: string) =>
        renderVerseText(t, `${keyBase}-${suffix}`, verseNum);

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

      if (nativeTouchSelect) {
        return renderText(text, 'body');
      }

      return (
        <>
          {sliceVerseWords(text).map((w, i) => {
            const anchor: WordAnchor = { verse: verseNum, start: w.start, end: w.end };
            const active = wordRange
              ? wordOverlapsRange(verseNum, w.start, w.end, wordRange)
              : false;
            const edge = active && wordRange
              ? wordSelectionEdge(verseNum, w.start, w.end, wordRange)
              : null;
            const cls = [
              'verse-word',
              active ? 'is-active' : '',
              edge?.left ? 'sel-edge-left' : '',
              edge?.right ? 'sel-edge-right' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <span
                key={`${keyBase}-w${i}`}
                className={cls}
                data-v={verseNum}
                data-s={w.start}
                data-e={w.end}
                onClick={(e) => {
                  if (isTouchPrimaryUI()) return;
                  e.stopPropagation();
                  const cur = wordRangeRef.current;
                  if (e.shiftKey && cur) {
                    applyWordRangeRef.current(cur.anchor, anchor);
                  } else {
                    applyWordRangeRef.current(anchor, anchor);
                  }
                }}
              >
                {renderVerseText(w.text, `${keyBase}-w${i}`, verseNum)}
              </span>
            );
          })}
        </>
      );
    },
    [renderVerseText, wordRange, nativeTouchSelect],
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
    const margin = 16;
    const systemMenuReserve = 0;
    const topReserve = chromeHidden ? 12 : 58;
    const bottomReserve = chromeHidden ? 24 : 76;
    // 应用条优先在选区下方，与 iOS 系统菜单（多在上方）错开
    let top = selBottom + margin;
    if (top + barH > window.innerHeight - bottomReserve) {
      top = selTop - barH - margin - systemMenuReserve;
    }
    top = Math.max(topReserve, Math.min(top, window.innerHeight - barH - bottomReserve));
    const halfW = Math.min(window.innerWidth * 0.48, 200);
    const left = Math.max(halfW + 8, Math.min(selCenterX, window.innerWidth - halfW - 8));
    setFocusBarStyle({
      top: `${top}px`,
      left: `${left}px`,
      bottom: 'auto',
      transform: 'translateX(-50%)',
    });
  }, [hasSel, minV, maxV, chromeHidden, nativeTouchSelect]);

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
  }, [hasSel, sortedSel, chromeHidden, updateFocusBarPosition]);

  const openThoughtHubForVerse = (verse: number, text: string) => {
    const refStr = listRefForVerse(book.id, chapter, verse);
    setThoughtHub({
      ref: refStr,
      label: `${bookAbbr(book.name)} ${chapter}:${verse}`,
      text,
      verse,
    });
  };

  const openThoughtWriteNew = (
    ref: string,
    label: string,
    verseText?: string,
    returnHub?: typeof thoughtHub,
  ) => {
    setThoughtWrite({
      mode: 'new',
      ref,
      label,
      verseText,
      returnHub: returnHub ?? undefined,
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
    openThoughtHubForVerse(verse, text);
  };

  const verseBlockStyle = {
    fontSize: fontPx,
    lineHeight: poetry ? 2.1 : 1.9,
    fontFamily: fontFamilyCss(fontFamily),
  };

  const englishUI = mainVersionId === 'kjv';
  const ui = readerUi(englishUI);

  const applyMarkChoice = useCallback((color: HighlightColor) => {
    if (!underlinesOn) {
      setUnderlinesOn(true);
      persistUnderlinesOn(true);
    }
    const added = pickHighlightColor(book.id, chapter, sortedSel, color, selectionSpan);
    setHighlightMap(getHighlightMap());
    flashToast(added ? '已划线' : '已取消划线');
  }, [book.id, chapter, sortedSel, selectionSpan, underlinesOn, flashToast]);

  const clearMark = useCallback(() => {
    const ok = clearHighlightForSelection(book.id, chapter, sortedSel, selectionSpan);
    if (!ok) return;
    setHighlightMap(getHighlightMap());
    flashToast('已取消划线');
  }, [book.id, chapter, sortedSel, selectionSpan, flashToast]);

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
    const syncTheme = () => {
      setTheme(getEffectiveReaderTheme());
      setReaderFollow(getReaderFollowApp());
    };
    syncTheme();
    window.addEventListener('app-theme-change', syncTheme);
    return () => window.removeEventListener('app-theme-change', syncTheme);
  }, []);

  useEffect(() => {
    if (!paneActive) {
      clearReaderChrome();
      return;
    }
    const bg = readerThemeBackground(theme);
    document.body.classList.add('reader-active');
    document.body.style.setProperty('--reader-surface-bg', bg);
    document.body.style.background = bg;
    document.documentElement.style.background = bg;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'night' ? '#12181c' : bg);
    return () => {
      clearReaderChrome();
      applyAppTheme();
    };
  }, [theme, paneActive]);

  useEffect(() => {
    if (!paneActive) {
      document.body.classList.remove('reader-immersive');
      return;
    }
    if (chromeHidden) document.body.classList.add('reader-immersive');
    else document.body.classList.remove('reader-immersive');
  }, [chromeHidden, paneActive]);

  // 半屏面板打开时显示顶栏与底部 Tab。
  useEffect(() => {
    if (overlayOpen) setChromeHidden(false);
  }, [overlayOpen]);

  useEffect(() => {
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
    if (saved && FONT_SIZES.some((f) => f.px === saved)) setFontPx(saved);
    else if (saved === 17) setFontPx(18); // 旧「中」字号迁移
    setFontFamilyState(getFontFamily());
    setPageTurnState(getPageTurn());
    setUnderlinesOn(getUnderlinesOn());
    setThoughtsOn(getThoughtsOn());
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--reader-font-size', `${fontPx}px`);
    document.documentElement.style.setProperty(
      '--reader-section-font-size',
      `${Math.max(13, Math.round(fontPx * 0.88))}px`,
    );
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
      setParallelError(null);
      setParallelLoading(false);
      return;
    }
    setParallelLoading(true);
    setParallelError(null);
    void bibleChapter(book.id, chapter, parallelVer)
      .then((verses) => {
        if (!verses?.length) {
          const label = versions?.find((v) => v.id === parallelVer)?.label ?? parallelVer.toUpperCase();
          setParallelError(`${label} 暂无经文`);
          setParallelVerses([]);
          return;
        }
        setParallelVerses(verses);
        setParallelError(null);
      })
      .catch(() => {
        const label = versions?.find((v) => v.id === parallelVer)?.label ?? parallelVer.toUpperCase();
        setParallelError(`${label} 加载失败`);
        setParallelVerses([]);
      })
      .finally(() => setParallelLoading(false));
  }, [layout, mainVersionId, book.id, chapter, parallelVer, versions]);

  const readerLocation = useMemo(() => ({ bookId: book.id, chapter }), [book.id, chapter]);

  const planNavActive = Boolean(planMeta?.steps.length);
  const canNavPrev = planNavActive
    ? canPlanNav(books, planMeta!.steps, readerLocation, -1)
    : canNavigateChapter(books, readerLocation, -1);
  const canNavNext = planNavActive
    ? canPlanNav(books, planMeta!.steps, readerLocation, 1)
    : canNavigateChapter(books, readerLocation, 1);

  const bundleOpts = useMemo(
    () => ({
      mainVersionId,
      parallelVer: layout === 'parallel' && !mainVersionId ? parallelVer : null,
    }),
    [mainVersionId, layout, parallelVer],
  );

  const applyPeekBundle = useCallback((side: 'prev' | 'next', bundle: ChapterReaderBundle | null) => {
    if (peekFrozenRef.current) {
      pendingPeekRef.current[side] = bundle;
      return;
    }
    if (side === 'prev') setPeekPrevBundle(bundle);
    else setPeekNextBundle(bundle);
  }, []);

  const prefetchTarget = useCallback(
    (bookId: string, ch: number) => {
      prefetchChapterReaderBundle(bookId, ch, bundleOpts);
    },
    [bundleOpts],
  );

  const prefetchVicinity = useCallback(() => {
    const resolveNav = (
      b: BibleBook[],
      loc: { bookId: string; chapter: number },
      delta: number,
    ) => (
      planNavActive
        ? resolvePlanNav(b, planMeta!.steps, loc, delta)
        : resolveChapterNav(b, loc, delta)
    );
    if (swipeTurn) {
      prefetchReaderVicinityBundles(books, book, chapter, bundleOpts, resolveNav, 2);
    } else {
      prefetchReaderVicinity(books, book, chapter, mainVersionId, (bookId, ch) => {
        void loadChapterVerses(bookId, ch, mainVersionId);
      }, 2);
    }
  }, [books, book, chapter, bundleOpts, swipeTurn, mainVersionId, planNavActive, planMeta]);

  useEffect(() => {
    if (!swipeTurn) return;
    preloadSectionTitles();
  }, [swipeTurn]);

  useEffect(() => {
    if (!swipeTurn) return;
    let cancelled = false;
    const prev = planNavActive
      ? resolvePlanNav(books, planMeta!.steps, readerLocation, -1)
      : resolveChapterNav(books, readerLocation, -1);
    const next = planNavActive
      ? resolvePlanNav(books, planMeta!.steps, readerLocation, 1)
      : resolveChapterNav(books, readerLocation, 1);
    setPeekPrevBook(prev?.book ?? null);
    setPeekNextBook(next?.book ?? null);
    setPeekPrevChapter(prev?.chapter ?? 0);
    setPeekNextChapter(next?.chapter ?? 0);

    const hydratePeek = async (
      target: ReturnType<typeof resolveChapterNav>,
      side: 'prev' | 'next',
    ) => {
      if (!target) {
        applyPeekBundle(side, null);
        return;
      }
      // 进入本章即预载邻章完整包；仅在齐备后一次性更新预览，避免分段排版跳动
      const bundle = await loadChapterReaderBundle(target.book.id, target.chapter, bundleOpts);
      if (!cancelled) applyPeekBundle(side, bundle);
    };

    void hydratePeek(prev, 'prev');
    void hydratePeek(next, 'next');
    prefetchVicinity();
    return () => {
      cancelled = true;
    };
  }, [
    books,
    book,
    chapter,
    swipeTurn,
    readerLocation,
    bundleOpts,
    planNavActive,
    planMeta,
    applyPeekBundle,
    prefetchVicinity,
  ]);

  useEffect(() => {
    setVerseTransitionOff(true);
    const t = window.setTimeout(() => setVerseTransitionOff(false), 480);
    return () => window.clearTimeout(t);
  }, [book.id, chapter]);

  useEffect(() => {
    setWholeVerseSel([]);
    setWordRange(null);
    nativePinGenRef.current += 1;
    nativePinnedHighlightRef.current = null;
    clearNativePinnedHighlight();
    setNativePinnedHighlight(null);
    setNativeSelection(null);
    setLiveNativeSelection(null);
    nativeSelectingRef.current = false;
    setNativeSelecting(false);
    window.getSelection()?.removeAllRanges();
    setViewportCenterVerse(null);
    setBookDone(false);
    readStartRef.current = Date.now();
    readingEngagedRef.current = false;
    cancelPendingChapterProgress();
    setChapterAnim(swipeTurn ? '' : 'chapter-enter');

    const skipHydrate = skipChapterHydrateRef.current;
    if (skipHydrate) {
      skipChapterHydrateRef.current = false;
      prefetchVicinity();
      scheduleChapterProgress(book.id, chapter, false, () => {
        maybeNotifyBookComplete(book.id, book.name, book.chapter_count);
      });
      setLastRead(book.id, chapter);
      return () => {
        cancelPendingChapterProgress();
      };
    }

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
          if (!altVerses?.length) {
            const verLabel =
              versions?.find((v) => v.id === mainVersionId)?.label ?? mainVersionId.toUpperCase();
            setVersionBanner(`${verLabel} 暂无经文，请稍后刷新或换译本`);
            setVerses([]);
            flashToast(`${verLabel} 暂无经文`);
          } else {
            setVersionBanner(null);
            setVerses(altVerses);
          }
        } else {
          setVersionBanner(null);
          setVerses(chineseVerses);
        }
        setChapterLoading(false);
        scheduleChapterProgress(book.id, chapter, false, () => {
          maybeNotifyBookComplete(book.id, book.name, book.chapter_count);
        });
        setLastRead(book.id, chapter);

        requestAnimationFrame(() => {
          const skipScrollReset = skipResumeOnLoadRef.current;
          if (!skipScrollReset && contentRef.current) contentRef.current.scrollTop = 0;
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
          if (layout === 'parallel') recordParallelChapter();
          maybeNotifyBookComplete(book.id, book.name, book.chapter_count);
        });
      } else if (cur < lastScrollTop.current - 6) {
        readingEngagedRef.current = true;
        confirmChapterProgress(book.id, chapter, () => {
          if (layout === 'parallel') recordParallelChapter();
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
      if (progressVerse != null) noteChapterVerseTouch(book.id, chapter, progressVerse);
      if (bestVerse != null) setViewportCenterVerse(bestVerse);

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

  const applyNavigate = useCallback(
    async (target: { book: BibleBook; chapter: number }, opts?: { fromSwipe?: boolean }) => {
      const isNextPeek =
        target.book.id === peekNextBook?.id && target.chapter === peekNextChapter;
      const isPrevPeek =
        target.book.id === peekPrevBook?.id && target.chapter === peekPrevChapter;
      const peek =
        isNextPeek ? peekNextVerses : isPrevPeek ? peekPrevVerses : null;
      const peekOutline =
        isNextPeek ? peekNextOutline : isPrevPeek ? peekPrevOutline : null;
      const version = chapterCacheVersion(mainVersionId);
      const cached = getCachedChapter(target.book.id, target.chapter, version);
      // 优先 peek / 当前译本缓存，再回退主译本缓存，减少快滑时空窗
      let instant =
        (peek?.length ? peek : null)
        ?? (cached?.length ? cached : null)
        ?? getChapterVersesSync(target.book.id, target.chapter, mainVersionId)
        ?? getChapterVersesSync(target.book.id, target.chapter, null);

      // 先到位再换内容：无缓存时等加载完成再切换，消灭闪白
      if (!instant?.length) {
        setChapterLoading(true);
        const loaded = await loadChapterVerses(
          target.book.id,
          target.chapter,
          mainVersionId,
        );
        if (loaded?.length) {
          instant = loaded;
          setCachedChapter(target.book.id, target.chapter, loaded, version);
        }
      }

      const outlineReady =
        peekOutline ?? outlineFor(target.book.id, target.chapter);

      if (instant?.length) {
        if (opts?.fromSwipe) {
          skipChapterHydrateRef.current = true;
          let structureSource = instant;
          if (mainVersionId) {
            const cnVersion = chapterCacheVersion(null);
            structureSource =
              getChapterVersesSync(target.book.id, target.chapter, null)
              ?? getCachedChapter(target.book.id, target.chapter, cnVersion)
              ?? instant;
          }
          flushSync(() => {
            setLayoutVerses(structureSource);
            setVerses(instant);
            setOutline(outlineReady ?? []);
            setChapterLoading(false);
          });
          if (contentRef.current) contentRef.current.scrollTop = 0;
        } else {
          setLayoutVerses(instant);
          setVerses(instant);
          setChapterLoading(false);
        }
        if (!cached?.length) {
          setCachedChapter(target.book.id, target.chapter, instant, version);
        }
      } else if (swipeTurn) {
        setChapterLoading(true);
      }
      readingEngagedRef.current = true;
      skipResumeOnLoadRef.current = true;
      if (!opts?.fromSwipe) scrollToChapterStart();
      onNavigate(target.book, target.chapter);
    },
    [
      peekNextBook,
      peekNextChapter,
      peekPrevBook,
      peekPrevChapter,
      peekNextVerses,
      peekPrevVerses,
      peekNextOutline,
      peekPrevOutline,
      mainVersionId,
      swipeTurn,
      scrollToChapterStart,
      onNavigate,
    ],
  );

  const navigateByDelta = useCallback(
    async (delta: number, opts?: { fromSwipe?: boolean }) => {
      if (planMeta?.steps.length) {
        const target = resolvePlanNav(books, planMeta.steps, readerLocation, delta);
        if (!target) return;
        const guard = planNavGuardRef.current;
        if (
          delta > 0
          && guard?.shouldConfirmForward(readerLocation, {
            bookId: target.book.id,
            chapter: target.chapter,
          })
        ) {
          guard.onForwardBoundary(
            { bookId: target.book.id, chapter: target.chapter },
            () => {
              void applyNavigate(target, opts);
            },
          );
          return;
        }
        await applyNavigate(target, opts);
        return;
      }

      const target = resolveChapterNav(books, readerLocation, delta);
      if (!target) return;
      await applyNavigate(target, opts);
    },
    [planMeta, books, readerLocation, applyNavigate],
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
    canPrev: canNavPrev,
    canNext: canNavNext,
    blocked: overlayOpen || hasSel,
    ignoreUntilRef: swipeIgnoreUntilRef,
    onChapterChange: navigateByDelta,
    onDragApproach: (delta) => {
      const target = planNavActive
        ? resolvePlanNav(books, planMeta!.steps, readerLocation, delta)
        : resolveChapterNav(books, readerLocation, delta);
      if (!target) return;
      void loadChapterVerses(target.book.id, target.chapter, mainVersionId);
      const syncOutline = outlineFor(target.book.id, target.chapter);
      if (syncOutline.length) {
        if (delta > 0) setPeekNextOutline(syncOutline);
        else setPeekPrevOutline(syncOutline);
        return;
      }
      void outlineForAsync(target.book.id, target.chapter).then((marks) => {
        if (delta > 0) setPeekNextOutline(marks);
        else setPeekPrevOutline(marks);
      });
    },
    onBoundary: (edge) => {
      if (planNavActive) {
        flashToast(edge === 'next' ? '已是今日计划最后一章' : '已是今日计划第一章');
        return;
      }
      flashToast(edge === 'next' ? '已是圣经最后一章' : '已是圣经第一章');
    },
  });

  const turnHintLabel = (() => {
    if (!turn.dragSide) return '';
    if (turn.dragSide === 'next') {
      if (!peekNextBook || peekNextChapter < 1) return englishUI ? 'End' : '已是末章';
      if (peekNextBook.id !== book.id) {
        return englishUI
          ? `${peekNextBook.name} ${peekNextChapter}`
          : `${peekNextBook.name} 第 ${peekNextChapter} 章`;
      }
      return englishUI ? `Ch. ${peekNextChapter}` : `第 ${peekNextChapter} 章`;
    }
    if (!peekPrevBook || peekPrevChapter < 1) return englishUI ? 'Start' : '已是首章';
    if (peekPrevBook.id !== book.id) {
      return englishUI
        ? `${peekPrevBook.name} ${peekPrevChapter}`
        : `${peekPrevBook.name} 第 ${peekPrevChapter} 章`;
    }
    return englishUI ? `Ch. ${peekPrevChapter}` : `第 ${peekPrevChapter} 章`;
  })();

  const resetNativePin = useCallback(() => {
    nativePinGenRef.current += 1;
    nativePinnedHighlightRef.current = null;
    clearNativePinnedHighlight();
    setNativePinnedHighlight(null);
  }, []);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    resetNativePin();
    setNativeSelection(null);
    setLiveNativeSelection(null);
    nativeSelectingRef.current = false;
    setNativeSelecting(false);
    setWholeVerseSel([]);
    setWordRange(null);
    wordRangeRef.current = null;
    wordDragPendingRef.current = null;
    if (wordDragRafRef.current) {
      cancelAnimationFrame(wordDragRafRef.current);
      wordDragRafRef.current = 0;
    }
    swipeIgnoreUntilRef.current = Date.now() + 320;
  }, []);

  const applyWordRange = useCallback((anchor: WordAnchor, focus: WordAnchor, opts?: { commit?: boolean }) => {
    const range: WordRange = { anchor, focus };
    if (wordRangesEqual(wordRangeRef.current, range)) return;
    const { verses: picked } = wordRangeToSpan(range);
    window.getSelection()?.removeAllRanges();
    setWholeVerseSel([]);
    setWordRange(range);
    wordRangeRef.current = range;
    if (opts?.commit === false) return;
    for (const v of picked) noteChapterVerseTouch(book.id, chapter, v);
    const hi = Math.max(...picked);
    setLastReadVerse(book.id, chapter, hi);
    lastSelectAt.current = Date.now();
    logVerseRead(`${book.id}.${chapter}.${hi}`);
    readingEngagedRef.current = true;
    swipeIgnoreUntilRef.current = Date.now() + 320;
  }, [book.id, chapter]);

  const commitWordRangeProgress = useCallback((range: WordRange | null) => {
    if (!range) return;
    const { verses: picked } = wordRangeToSpan(range);
    if (!picked.length) return;
    for (const v of picked) noteChapterVerseTouch(book.id, chapter, v);
    const hi = Math.max(...picked);
    setLastReadVerse(book.id, chapter, hi);
    lastSelectAt.current = Date.now();
    logVerseRead(`${book.id}.${chapter}.${hi}`);
    readingEngagedRef.current = true;
  }, [book.id, chapter]);

  applyWordRangeRef.current = applyWordRange;
  wordRangeRef.current = wordRange;

  const scheduleWordRangeDuringDrag = useCallback((anchor: WordAnchor, focus: WordAnchor) => {
    wordDragPendingRef.current = { anchor, focus };
    if (wordDragRafRef.current) return;
    wordDragRafRef.current = requestAnimationFrame(() => {
      wordDragRafRef.current = 0;
      const pending = wordDragPendingRef.current;
      if (!pending) return;
      applyWordRangeRef.current(pending.anchor, pending.focus, { commit: false });
    });
  }, []);

  // 触控/PWA：同步系统原生划选；选区落定后收起系统菜单，保留应用工具条
  useEffect(() => {
    const root = contentRef.current;
    if (!root || !nativeTouchSelect) return;
    const blockMenu = (e: Event) => e.preventDefault();
    root.addEventListener('contextmenu', blockMenu);
    let raf = 0;
    let collapseTimer = 0;
    const pinningRef = { current: false };

    const setSelecting = (on: boolean) => {
      nativeSelectingRef.current = on;
      setNativeSelecting(on);
      if (on) {
        nativePinGenRef.current += 1;
        nativePinnedHighlightRef.current = null;
        clearNativePinnedHighlight();
        setNativePinnedHighlight(null);
      }
    };

    const collapseSystemSelection = () => {
      if (nativeSelectingRef.current) return;
      const pinned = readNativePinnedHighlight(root);
      if (pinned?.text) {
        nativePinnedHighlightRef.current = pinned;
        setNativeSelection({
          verses: pinned.verses,
          text: pinned.text,
        });
        setLiveNativeSelection({
          verses: pinned.verses,
          text: pinned.text,
        });
        setNativePinnedHighlight(pinned);
        setWholeVerseSel([]);
        setWordRange(null);
        wordRangeRef.current = null;
        lastSelectAt.current = Date.now();
        swipeIgnoreUntilRef.current = Date.now() + 320;
      }
      pinningRef.current = true;
      requestAnimationFrame(() => {
        const keepNativeSel = Boolean(
          pinned?.spans.length && !supportsCssCustomHighlight(),
        );
        if (!keepNativeSel) {
          window.getSelection()?.removeAllRanges();
        }
        requestAnimationFrame(() => {
          pinningRef.current = false;
        });
      });
    };

    const scheduleCollapse = (delayMs: number) => {
      if (nativeSelectingRef.current) return;
      window.clearTimeout(collapseTimer);
      collapseTimer = window.setTimeout(collapseSystemSelection, delayMs);
    };

    const commitLiveSelection = () => {
      const next = readNativeVerseSelection(root);
      setLiveNativeSelection(next);
      setNativeSelection((prev) => {
        if (!next) return prev;
        if (
          prev &&
          next.text === prev.text &&
          next.verses.join(',') === prev.verses.join(',')
        ) {
          return prev;
        }
        return next;
      });
      if (next) {
        setWholeVerseSel([]);
        setWordRange(null);
        wordRangeRef.current = null;
        scheduleCollapse(120);
      }
    };

    const sync = () => {
      if (pinningRef.current) return;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next = readNativeVerseSelection(root);
        if (nativeSelectingRef.current) {
          setLiveNativeSelection(next);
          return;
        }
        setLiveNativeSelection(next);
        setNativeSelection((prev) => {
          if (!next) {
            return prev;
          }
          if (
            prev &&
            next.text === prev.text &&
            next.verses.join(',') === prev.verses.join(',')
          ) {
            return prev;
          }
          return next;
        });
        if (next) {
          setWholeVerseSel([]);
          setWordRange(null);
          wordRangeRef.current = null;
          scheduleCollapse(160);
        }
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      window.clearTimeout(collapseTimer);
      setSelecting(true);
    };

    const onPointerUp = () => {
      setSelecting(false);
      commitLiveSelection();
    };

    document.addEventListener('selectionchange', sync);
    root.addEventListener('pointerdown', onPointerDown, { passive: true });
    root.addEventListener('touchend', onPointerUp, { passive: true });
    root.addEventListener('pointerup', onPointerUp, { passive: true });
    root.addEventListener('pointercancel', onPointerUp, { passive: true });
    return () => {
      root.removeEventListener('contextmenu', blockMenu);
      document.removeEventListener('selectionchange', sync);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('touchend', onPointerUp);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerUp);
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(collapseTimer);
    };
  }, [book.id, chapter, swipeTurn, nativeTouchSelect, verses]);

  // 触控 pin 高亮：DOM 稳定后绘制，不改动经文 React 树
  useEffect(() => {
    const root = contentRef.current;
    if (!root || !nativeTouchSelect) return;
    if (nativeSelecting || !nativePinnedHighlight?.spans.length) {
      clearNativePinnedHighlight();
      return;
    }
    const gen = nativePinGenRef.current;
    const id = requestAnimationFrame(() => {
      if (gen !== nativePinGenRef.current) return;
      const pin = nativePinnedHighlightRef.current;
      if (!pin?.spans.length) {
        clearNativePinnedHighlight();
        return;
      }
      applyNativePinnedHighlight(root, pin);
    });
    return () => {
      cancelAnimationFrame(id);
      clearNativePinnedHighlight();
    };
  }, [
    nativeTouchSelect,
    nativeSelecting,
    nativePinnedHighlight,
    book.id,
    chapter,
    verses,
  ]);

  // 桌面：长按选词 + 拖动扩选（词块 + wordRange）
  useEffect(() => {
    const el = contentRef.current;
    if (!el || nativeTouchSelect) return;

    const wordFromPoint = (x: number, y: number): WordAnchor | null => {
      const node = document.elementFromPoint(x, y);
      const w = node?.closest('.verse-word') as HTMLElement | null;
      if (!w || !el.contains(w)) return null;
      const verse = Number(w.dataset.v);
      const start = Number(w.dataset.s);
      const end = Number(w.dataset.e);
      if (!verse || Number.isNaN(start) || Number.isNaN(end)) return null;
      return { verse, start, end };
    };

    let anchor: (WordAnchor & { x: number; y: number }) | null = null;
    let dragging = false;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    const clearLongPress = () => {
      if (longPressTimer != null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const w = wordFromPoint(t.clientX, t.clientY);
      if (!w) return;
      window.getSelection()?.removeAllRanges();
      anchor = { ...w, x: t.clientX, y: t.clientY };
      dragging = false;
      clearLongPress();
      longPressTimer = setTimeout(() => {
        if (!anchor || dragging) return;
        applyWordRangeRef.current(anchor, anchor);
        clearLongPress();
      }, 420);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!anchor || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!dragging && Math.hypot(t.clientX - anchor.x, t.clientY - anchor.y) < 10) return;
      dragging = true;
      clearLongPress();
      e.preventDefault();
      const w = wordFromPoint(t.clientX, t.clientY);
      if (!w) return;
      scheduleWordRangeDuringDrag(anchor, w);
    };

    const onTouchEnd = () => {
      clearLongPress();
      if (dragging) {
        const pending = wordDragPendingRef.current;
        if (pending) {
          applyWordRangeRef.current(pending.anchor, pending.focus, { commit: false });
        }
        if (wordRangeRef.current) {
          commitWordRangeProgress(wordRangeRef.current);
          swipeIgnoreUntilRef.current = Date.now() + 320;
        }
      }
      if (wordDragRafRef.current) {
        cancelAnimationFrame(wordDragRafRef.current);
        wordDragRafRef.current = 0;
      }
      wordDragPendingRef.current = null;
      anchor = null;
      dragging = false;
      window.getSelection()?.removeAllRanges();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      clearLongPress();
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [book.id, chapter, swipeTurn, scheduleWordRangeDuringDrag, commitWordRangeProgress, nativeTouchSelect]);

  const selectWholeVerse = useCallback((verse: number) => {
    window.getSelection()?.removeAllRanges();
    setWordRange(null);
    setWholeVerseSel([verse]);
    noteChapterVerseTouch(book.id, chapter, verse);
    setLastReadVerse(book.id, chapter, verse);
    lastSelectAt.current = Date.now();
    logVerseRead(`${book.id}.${chapter}.${verse}`);
    readingEngagedRef.current = true;
    swipeIgnoreUntilRef.current = Date.now() + 320;
  }, [book.id, chapter]);

  const handleVerseDoubleClick = useCallback(
    (e: React.MouseEvent, verse: number) => {
      e.preventDefault();
      e.stopPropagation();
      selectWholeVerse(verse);
    },
    [selectWholeVerse],
  );

  const handleVerseClick = useCallback(
    (e: React.MouseEvent, verse: number, text: string) => {
      e.stopPropagation();
      handleVerseThoughtClick(e, verse, text);
    },
    [handleVerseThoughtClick],
  );

  useEffect(() => {
    if (!overlayOpen) return;
    const el = contentRef.current;
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!el) {
      return () => {
        document.body.style.overflow = prevBodyOverflow;
      };
    }
    const prevOverflow = el.style.overflow;
    const prevTouchAction = el.style.touchAction;
    el.style.overflow = 'hidden';
    el.style.touchAction = 'none';
    return () => {
      el.style.overflow = prevOverflow;
      el.style.touchAction = prevTouchAction;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [overlayOpen]);

  useEffect(() => {
    if (!hasSel) {
      setMarkPaletteOpen(false);
    }
  }, [hasSel]);

  const prevHasSelRef = useRef(false);
  useEffect(() => {
    if (prevHasSelRef.current && !hasSel) {
      swipeIgnoreUntilRef.current = Date.now() + 320;
    }
    prevHasSelRef.current = hasSel;
  }, [hasSel]);

  useEffect(() => {
    setMarkPaletteOpen(false);
  }, [selRef, selectionSpan?.start, selectionSpan?.end]);

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
        onPlanDayFinished={() => {
          flashToast(`第 ${planMeta.day} 天计划已读完`);
        }}
        onContinueNextDay={(nextDay) => {
          void (async () => {
            const active = getActivePlan();
            if (!active) return;
            const meta = await buildPlanReadingMeta(active, nextDay);
            if (!meta) {
              flashToast('下一天内容暂不可用');
              return;
            }
            onPlanMetaChange?.(meta);
            const step = meta.steps[meta.session.currentStepIndex] ?? meta.steps[0];
            onPlanJump?.(step.bookId, step.chapterStart);
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.set('plan', meta.planId);
              url.searchParams.set('day', String(meta.day));
              url.searchParams.set('book', step.bookId);
              url.searchParams.set('chapter', String(step.chapterStart));
              window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
            }
          })();
        }}
        bindNavGuard={bindPlanNavGuard}
        onOverlayChange={setPlanOverlayOpen}
      />
    ) : null
  );

  const jumpToFirstVerse = useCallback(() => {
    scrollToChapterStart();
    document.getElementById('verse-anchor-1')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [scrollToChapterStart]);

  const renderFeedHint = (verseNum: number) => {
    if (!feedHint || feedHintDismissed || feedHintVerse !== verseNum) return null;
    return (
      <div className="reader-feed-activity-hint" role="status">
        <span className="reader-feed-activity-hint-label">{feedHintMessage(feedHint)}</span>
        {feedHint.body && feedHint.kind !== 'checkin' ? (
          <p className="reader-feed-activity-hint-body">{feedHint.body}</p>
        ) : null}
      </div>
    );
  };

  const renderChapterHead = () => (
    <div
      className="reader-chapter-head"
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        jumpToFirstVerse();
      }}
      title="双击回到本章第一节"
    >
      <span className="reader-chapter-title">
        {book.name} · {englishUI ? `Chapter ${chapter}` : `第 ${chapter} 章`}
      </span>
    </div>
  );

  const renderChapterVerses = () => (
    <>
      {verses.length === 0 && chapterLoading ? (
        <ReaderSkeleton />
      ) : verses.length === 0 && versionBanner ? (
        <p className="muted reader-version-banner">{versionBanner}</p>
      ) : verses.length === 0 ? null : layout === 'parallel' && !mainVersionId ? (
        <div className="reader-parallel">
          {paragraphs.map((para) => {
            const marks = outline.filter((s) => s.verse >= para.startVerse && s.verse <= para.endVerse);
            const firstMark = marks.find((m) => m.verse === para.startVerse) || marks[0];
            return (
              <div key={para.startVerse} className="reader-parallel-block">
                {firstMark && firstMark.verse === para.startVerse && (
                  <SectionTitle
                    title={firstMark.title}
                    onRefClick={(osis, label) => setVersePreview({ osis, label })}
                  />
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
                        <Fragment key={v.verse}>
                          {renderFeedHint(v.verse)}
                          <span
                            id={`verse-anchor-${v.verse}`}
                            className={`verse-inline verse-token ${highlightClass(wholeMark)}${verseThoughtClass(v.verse)}${verseSelClass(v.verse)}`}
                            onClick={(e) => handleVerseClick(e, v.verse, text)}
                            onDoubleClick={(e) => handleVerseDoubleClick(e, v.verse)}
                          >
                          {verseNo !== 'hidden' && (
                            <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
                          )}
                          <span className="verse-text-body">
                            {renderVerseBody(
                              text,
                              `p${v.verse}`,
                              v.verse,
                              resumeFlashVerse === v.verse,
                              markInfo ?? undefined,
                            )}
                          </span>
                        </span>
                        </Fragment>
                      );
                    })}
                  </div>
                  <div className="reader-parallel-secondary">
                    {parallelLoading ? (
                      <span className="muted">对照译本加载中…</span>
                    ) : parallelError ? (
                      <span className="reader-parallel-error">{parallelError}</span>
                    ) : (
                      para.verses.map((v) => {
                        const p2 = parallelVerses.find((x) => x.verse === v.verse);
                        return (
                          <span key={v.verse} className="verse-inline">
                            {verseNo !== 'hidden' && (
                              <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
                            )}
                            {p2?.text ?? '—'}{' '}
                          </span>
                        );
                      })
                    )}
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
                <SectionTitle
                  title={firstMark.title}
                  onRefClick={(osis, label) => setVersePreview({ osis, label })}
                />
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
                    <Fragment key={v.verse}>
                      {renderFeedHint(v.verse)}
                      <span
                        id={`verse-anchor-${v.verse}`}
                        className={`verse-inline verse-token ${highlightClass(wholeMark)}${verseThoughtClass(v.verse)}${verseSelClass(v.verse)}`}
                        onClick={(e) => handleVerseClick(e, v.verse, verseDisplayText(v.verse, v.text))}
                        onDoubleClick={(e) => handleVerseDoubleClick(e, v.verse)}
                      >
                        {verseNo !== 'hidden' && (
                          <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
                        )}
                        <span className="verse-text-body">
                          {renderVerseBody(
                            verseDisplayText(v.verse, v.text),
                            `v${v.verse}`,
                            v.verse,
                            resumeFlashVerse === v.verse,
                            markInfo ?? undefined,
                          )}
                        </span>
                      </span>
                    </Fragment>
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
      onClick={(e) => {
        if (focusBarRef.current?.contains(e.target as Node)) return;
        // 忽略长按/双击后的余波点击，避免立即取消选中。
        if (Date.now() - lastSelectAt.current < 500) return;
        if (overlayOpen) return;
        if (hasSel) {
          clearSelection();
          return;
        }
        toggleChrome();
      }}
    >
      <div className="reader-topbar" aria-hidden={chromeHidden}>
        <div className="reader-topbar-left">
          {backHref && (
            <PageBackBar
              href={readerBackHref()}
              label="返回"
              className="reader-nav-back"
              onClick={(e) => {
                e.stopPropagation();
                clearReaderReturnHref();
              }}
            />
          )}
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
          <div className="reader-loc-wrap">
            <button
              ref={locBtnRef}
              type="button"
              className={`reader-loc${locPopoverOpen ? ' is-open' : ''}`}
              aria-expanded={locPopoverOpen}
              aria-haspopup="dialog"
              onClick={(e) => {
                e.stopPropagation();
                setLocPopoverOpen((v) => !v);
              }}
            >
              {bookAbbr(book.name)} {chapter}
              <span className="reader-loc-chevron" aria-hidden>▾</span>
            </button>
          </div>
          <button
            type="button"
            className="reader-summary-btn"
            onClick={(e) => {
              e.stopPropagation();
              setSummaryOpen(true);
            }}
          >
            概要
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
          className={`reader-content ${chapterAnim}${swipeTurn ? ' reader-content-turn' : ''}${verseTransitionOff || turn.animating ? ' verse-transition-off' : ''}`}
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
              {turn.dragSide && (
                <div
                  className={`reader-turn-hint reader-turn-hint-${turn.dragSide}${turn.dragProgress >= 0.25 ? ' is-ready' : ''}`}
                  aria-live="polite"
                >
                  <span className="reader-turn-hint-arrow">
                    {turn.dragSide === 'next' ? '›' : '‹'}
                  </span>
                  <span className="reader-turn-hint-label">{turnHintLabel}</span>
                </div>
              )}
              <div
                className="reader-turn-track"
                ref={turn.trackRef}
                style={{ transform: 'translateX(-33.3333%)' }}
              >
                <div className="reader-turn-panel reader-turn-panel-peek" aria-hidden>
                  <ReaderChapterPeek
                    bookId={peekPrevBook?.id ?? book.id}
                    chapter={peekPrevChapter}
                    verses={peekPrevVerses}
                    structureVerses={peekPrevLayoutVerses}
                    outline={peekPrevOutline ?? []}
                    englishUI={englishUI}
                    verseNo={verseNo}
                    verseBlockStyle={verseBlockStyle}
                    renderVerseText={renderVerseText}
                    highlightMap={highlightMap}
                    underlinesOn={underlinesOn}
                  />
                </div>
                <div ref={contentRef} className="reader-turn-panel reader-turn-panel-active">
                  {renderChapterVerses()}
                </div>
                <div className="reader-turn-panel reader-turn-panel-peek" aria-hidden>
                  <ReaderChapterPeek
                    bookId={peekNextBook?.id ?? book.id}
                    chapter={peekNextChapter}
                    verses={peekNextVerses}
                    structureVerses={peekNextLayoutVerses}
                    outline={peekNextOutline ?? []}
                    englishUI={englishUI}
                    verseNo={verseNo}
                    verseBlockStyle={verseBlockStyle}
                    renderVerseText={renderVerseText}
                    highlightMap={highlightMap}
                    underlinesOn={underlinesOn}
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

      <div
        className={`reader-fab-stack${chromeHidden || hasSel ? ' is-hidden' : ''}`}
        aria-hidden={chromeHidden || hasSel}
      >
        {planMeta && onPlanExit && (
          <button
            type="button"
            className="reader-fab reader-fab-plan-exit reader-fab-sm"
            onClick={(e) => { e.stopPropagation(); onPlanExit(); }}
            aria-label="退出计划模式"
          >
            退出计划
          </button>
        )}
        {hasGroups && (
          <button
            type="button"
            className="reader-fab reader-fab-group reader-fab-sm"
            onClick={(e) => { e.stopPropagation(); setGroupCheckinOpen(true); }}
            aria-label="打卡到共读群"
          >
            {groupCtx.groupId ? '打卡到群' : '打卡'}
          </button>
        )}
        <button
          type="button"
          className="reader-fab"
          onClick={(e) => { e.stopPropagation(); openAiSheet(); }}
          aria-label="问小爱"
        >
          ✦ 小爱
        </button>
      </div>

      {hasSel && !overlayOpen && (
        <div
          ref={focusBarRef}
          className="reader-focus-bar reader-focus-bar-ext reader-focus-bar-near"
          style={focusBarStyle}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {underlinesOn && markPaletteOpen && !currentMark && (
            <div className="reader-focus-row reader-focus-row-mark" role="group" aria-label="划线颜色">
              {MARK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`reader-weread-dot reader-mark-dot-${c}`}
                  title={MARK_COLOR_SEMANTICS[c].label}
                  aria-label={MARK_COLOR_SEMANTICS[c].label}
                  onClick={() => {
                    applyMarkChoice(c);
                    setMarkPaletteOpen(false);
                  }}
                />
              ))}
            </div>
          )}
          <div className="reader-focus-row reader-focus-row-actions">
            {thoughtsOn && (
              <button
                type="button"
                className="vsb-icon-btn"
                onClick={() => {
                  setMarkPaletteOpen(false);
                  openThoughtWriteNew(
                    selRef,
                    effRefLabel,
                    effSelectionText || undefined,
                  );
                  clearSelection();
                }}
              >
                <span className="vsb-icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z" />
                    <path d="M10 19h4M11 22h2" />
                  </svg>
                </span>
                <span className="vsb-label">想法</span>
              </button>
            )}
            {underlinesOn && (
              <button
                type="button"
                className={`vsb-icon-btn${markPaletteOpen || currentMark ? ' vsb-icon-btn-active' : ''}`}
                onClick={() => {
                  if (currentMark) {
                    clearMark();
                    setMarkPaletteOpen(false);
                    return;
                  }
                  setMarkPaletteOpen((v) => !v);
                }}
              >
                <span className="vsb-icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 20h7" />
                    <path d="M14 19l6-6-4-4-6 6v4h4z" />
                    <path d="M13 12l3 3" />
                  </svg>
                </span>
                <span className="vsb-label">{currentMark ? '取消划线' : '划线'}</span>
              </button>
            )}
            <button
              type="button"
              className="vsb-icon-btn"
              onClick={() => {
                setMarkPaletteOpen(false);
                void navigator.clipboard.writeText(`${effRefLabel} ${effSelectionText}`);
                flashToast(englishUI ? 'Copied' : '已复制');
                clearSelection();
              }}
            >
              <span className="vsb-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
              </span>
              <span className="vsb-label">{ui.copy}</span>
            </button>
            <button
              type="button"
              className="vsb-icon-btn"
              onClick={() => {
                setMarkPaletteOpen(false);
                setToolsSheet({
                  tab: 'crossrefs',
                  refParam: effRefParam,
                  refLabel: effRefLabel,
                  sourceText: effSelectionText || undefined,
                });
                clearSelection();
              }}
            >
              <span className="vsb-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 6h11M8 12h11M8 18h11" />
                  <path d="M4 6h.01M4 12h.01M4 18h.01" />
                </svg>
              </span>
              <span className="vsb-label">相关</span>
            </button>
            <button
              type="button"
              className="vsb-icon-btn"
              onPointerDown={(e) => {
                e.stopPropagation();
                selectionPinRef.current = effSelectionText;
              }}
              onClick={() => {
                setMarkPaletteOpen(false);
                setAiSheetContext({
                  refParam: effRefParam,
                  refLabel: effRefLabel,
                  selectionText: selectionPinRef.current || effSelectionText,
                });
                clearSelection();
                setAiSheet(true);
              }}
            >
              <span className="vsb-icon" aria-hidden>✦</span>
              <span className="vsb-label">小爱</span>
            </button>
          </div>
        </div>
      )}

      {thoughtHub && !thoughtWrite && (
        <ThoughtHubSheet
          refStr={thoughtHub.ref}
          refLabel={thoughtHub.label}
          verseText={thoughtHub.text}
          bookId={book.id}
          chapter={chapter}
          verse={thoughtHub.verse}
          onChanged={() => setThoughtRevision((n) => n + 1)}
          onClose={() => setThoughtHub(null)}
          onWriteNew={() => {
            openThoughtWriteNew(
              thoughtHub.ref,
              thoughtHub.label,
              thoughtHub.text,
              thoughtHub,
            );
            setThoughtHub(null);
          }}
          onEdit={(t) => {
            setThoughtWrite({
              mode: 'edit',
              ref: t.ref,
              label: thoughtHub.label,
              verseText: thoughtHub.text,
              thoughtId: t.id,
              initialBody: t.body,
              initialVisibility: t.visibility,
              returnHub: thoughtHub,
            });
            setThoughtHub(null);
          }}
        />
      )}

      {thoughtWrite && (
        <ThoughtWriteSheet
          refStr={thoughtWrite.ref}
          refLabel={thoughtWrite.label}
          verseText={thoughtWrite.verseText}
          mode={thoughtWrite.mode}
          initialBody={thoughtWrite.initialBody}
          initialVisibility={thoughtWrite.initialVisibility}
          onSave={(body, visibility) => {
            if (thoughtWrite.mode === 'edit' && thoughtWrite.thoughtId) {
              updateThought(thoughtWrite.thoughtId, body, visibility);
            } else {
              addThought(thoughtWrite.ref, body, visibility);
            }
            setThoughtRevision((n) => n + 1);
            flashToast('想法已保存');
            const returnHub = thoughtWrite.returnHub;
            setThoughtWrite(null);
            if (returnHub) setThoughtHub(returnHub);
          }}
          onClose={() => setThoughtWrite(null)}
          onBack={
            thoughtWrite.returnHub
              ? () => {
                  const returnHub = thoughtWrite.returnHub!;
                  setThoughtWrite(null);
                  setThoughtHub(returnHub);
                }
              : undefined
          }
        />
      )}

      {showSettings && (
        <ReaderSheetPortal
          onClose={() => setShowSettings(false)}
          sheetClassName="sheet card reader-settings-sheet"
        >
          <h3 style={{ marginTop: 0 }}>{ui.settings}</h3>
            <p className="muted" style={{ fontSize: 12 }}>阅读器主题</p>
            <div className="reader-theme-swatches">
              {READER_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`reader-theme-swatch ${theme === t.id ? 'reader-theme-swatch-active' : ''}`}
                  disabled={readerFollow}
                  onClick={() => {
                    setReaderFollow(false);
                    setReaderFollowApp(false);
                    setTheme(t.id);
                    setReaderTheme(t.id);
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
                checked={readerFollow}
                onChange={(e) => {
                  const on = e.target.checked;
                  setReaderFollow(on);
                  setReaderFollowApp(on);
                  if (on) setTheme(getEffectiveReaderTheme());
                }}
              />
            </label>
            <Link href="/profile/appearance" className="muted" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              更多外观选项 ›
            </Link>
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
        </ReaderSheetPortal>
      )}

      {aiSheet && aiSheetContext && (
        <XiaoAiSheet
          key={`ask-${aiSheetContext.refParam}`}
          mode="ask"
          refParam={aiSheetContext.refParam}
          refLabel={aiSheetContext.refLabel}
          selectionText={aiSheetContext.selectionText}
          onClose={() => {
            setAiSheet(false);
            setAiSheetContext(null);
          }}
        />
      )}

      {toolsSheet && (
        <ReaderToolsSheet
          refParam={toolsSheet.refParam}
          refLabel={toolsSheet.refLabel}
          sourceText={toolsSheet.sourceText}
          initialTab={toolsSheet.tab}
          onClose={() => setToolsSheet(null)}
        />
      )}

      {versePreview && (
        <VersePreviewSheet
          refParam={versePreview.osis}
          refLabel={versePreview.label}
          onClose={() => setVersePreview(null)}
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

      {locPopoverOpen && (
        <ReaderLocPopover
          open={locPopoverOpen}
          anchorRef={locBtnRef}
          books={books}
          book={book}
          chapter={chapter}
          bookAbbr={bookAbbr}
          planSteps={planMeta?.steps}
          onPickChapter={onNavigate}
          onClose={() => setLocPopoverOpen(false)}
        />
      )}

      {summaryOpen && (
        <SummarySheet
          bookId={book.id}
          bookName={book.name}
          chapter={chapter}
          englishUI={englishUI}
          onClose={() => setSummaryOpen(false)}
        />
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
