/** 读经邻章 peek 预载 + 周边章节 prefetch。 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BibleBook } from '@/lib/api';
import {
  loadChapterReaderBundle,
  prefetchChapterReaderBundle,
  prefetchReaderVicinityBundles,
  type ChapterReaderBundle,
} from '@/lib/chapter_reader_bundle';
import { loadChapterVerses } from '@/lib/chapter_prefetch';
import { canNavigateChapter, prefetchReaderVicinity, resolveChapterNav } from '@/lib/reader_navigation';
import { canPlanNav, resolvePlanNav } from '@/lib/plan_navigation';
import type { PlanReadingMeta } from '@/lib/plan_reading';
import { resetReaderScroll } from '@/lib/reader_viewport';
import { preloadSectionTitles } from '@/lib/section_titles';
import { preloadParagraphRanges } from '@/lib/paragraph_ranges';
import { preloadDiscourseRanges } from '@/lib/discourse_ranges';
import { preloadPoetryLines } from '@/lib/poetry_lines';
import type { ReadingLayout } from '@/lib/reader_settings';

export function useReaderPeekPrefetch(opts: {
  books: BibleBook[];
  book: BibleBook;
  chapter: number;
  swipeTurn: boolean;
  mainVersionId: string | null;
  layout: ReadingLayout;
  parallelVer: string;
  planMeta?: PlanReadingMeta | null;
}) {
  const {
    books,
    book,
    chapter,
    swipeTurn,
    mainVersionId,
    layout,
    parallelVer,
    planMeta,
  } = opts;

  const [peekPrevBundle, setPeekPrevBundle] = useState<ChapterReaderBundle | null>(null);
  const [peekNextBundle, setPeekNextBundle] = useState<ChapterReaderBundle | null>(null);
  const [peekPrevBook, setPeekPrevBook] = useState<BibleBook | null>(null);
  const [peekNextBook, setPeekNextBook] = useState<BibleBook | null>(null);
  const [peekPrevChapter, setPeekPrevChapter] = useState(0);
  const [peekNextChapter, setPeekNextChapter] = useState(0);

  const peekFrozenRef = useRef(false);
  const pendingPeekRef = useRef<{
    prev: ChapterReaderBundle | null;
    next: ChapterReaderBundle | null;
  }>({ prev: null, next: null });
  const peekPrevPanelRef = useRef<HTMLDivElement>(null);
  const peekNextPanelRef = useRef<HTMLDivElement>(null);

  const readerLocation = useMemo(
    () => ({ bookId: book.id, chapter }),
    [book.id, chapter],
  );
  const planNavActive = Boolean(planMeta?.steps.length);

  const bundleOpts = useMemo(
    () => ({
      mainVersionId,
      parallelVer: layout === 'parallel' ? parallelVer : null,
    }),
    [mainVersionId, layout, parallelVer],
  );

  const resetPeekPanelsScroll = useCallback(() => {
    resetReaderScroll(peekPrevPanelRef.current);
    resetReaderScroll(peekNextPanelRef.current);
  }, []);

  const applyPeekBundle = useCallback((side: 'prev' | 'next', bundle: ChapterReaderBundle | null) => {
    if (peekFrozenRef.current) {
      pendingPeekRef.current[side] = bundle;
      return;
    }
    if (side === 'prev') setPeekPrevBundle(bundle);
    else setPeekNextBundle(bundle);
    requestAnimationFrame(() => {
      resetReaderScroll(side === 'prev' ? peekPrevPanelRef.current : peekNextPanelRef.current);
    });
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
    preloadSectionTitles(mainVersionId);
    preloadParagraphRanges();
    preloadDiscourseRanges();
    preloadPoetryLines();
  }, [swipeTurn, mainVersionId]);

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
    if (!swipeTurn) return;
    resetPeekPanelsScroll();
  }, [
    swipeTurn,
    peekPrevChapter,
    peekNextChapter,
    peekPrevBook?.id,
    peekNextBook?.id,
    resetPeekPanelsScroll,
  ]);

  const flushPendingPeek = useCallback(() => {
    const pending = pendingPeekRef.current;
    if (pending.prev !== null) {
      setPeekPrevBundle(pending.prev);
      pendingPeekRef.current.prev = null;
    }
    if (pending.next !== null) {
      setPeekNextBundle(pending.next);
      pendingPeekRef.current.next = null;
    }
    requestAnimationFrame(resetPeekPanelsScroll);
  }, [resetPeekPanelsScroll]);

  return {
    readerLocation,
    planNavActive,
    canNavPrev: planNavActive
      ? canPlanNav(books, planMeta!.steps, readerLocation, -1)
      : canNavigateChapter(books, readerLocation, -1),
    canNavNext: planNavActive
      ? canPlanNav(books, planMeta!.steps, readerLocation, 1)
      : canNavigateChapter(books, readerLocation, 1),
    bundleOpts,
    peekPrevBundle,
    peekNextBundle,
    peekPrevBook,
    peekNextBook,
    peekPrevChapter,
    peekNextChapter,
    peekPrevPanelRef,
    peekNextPanelRef,
    peekFrozenRef,
    prefetchTarget,
    prefetchVicinity,
    resetPeekPanelsScroll,
    flushPendingPeek,
    prefetchApproach: (delta: number) => {
      const target = planNavActive
        ? resolvePlanNav(books, planMeta!.steps, readerLocation, delta)
        : resolveChapterNav(books, readerLocation, delta);
      if (!target) return;
      prefetchChapterReaderBundle(target.book.id, target.chapter, bundleOpts);
    },
  };
}
