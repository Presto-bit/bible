'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { useToast } from '@/components/ui/ToastProvider';
import {
  getPlatformShelfBook,
  getPlatformShelfSection,
  loadShelfBookProgress,
  peekShelfSectionCache,
  prefetchShelfSection,
  saveShelfProgress,
  type ShelfBookDetail,
  type ShelfSection,
} from '@/lib/shelf_api';
import { useShelfReadingPrefs } from '@/components/shelf/ShelfReadingBar';
import ShelfFontSheet from '@/components/shelf/ShelfFontSheet';
import ShelfPaginatedProse from '@/components/shelf/ShelfPaginatedProse';
import { shelfReadingStyleVars } from '@/lib/shelf_reading';
import { buildShelfTocGroups, resolveSectionId, shelfTocDisplayTitle } from '@/lib/shelf_toc';
import { buildShelfCheckinRef, formatShelfCheckinLabel, rememberShelfRefLabel } from '@/lib/shelf_checkin';
import { maybeShowShelfReadingHint, shelfSectionIsPdf } from '@/lib/shelf_reader_contract';
import { notifyFlutterShelfPath, setShelfReaderChrome } from '@/lib/shelf_host';
import { useShelfTurn, type ShelfTurnKind } from '@/components/shelf/useShelfTurn';
import '@/styles/plans.css';
import '@/styles/shelf.css';

const ShelfLessonPanel = dynamic(() => import('@/components/shelf/ShelfLessonPanel'), {
  ssr: false,
  loading: () => <p className="muted shelf-pdf-status">加载教案…</p>,
});

const ShelfCheckinSheet = dynamic(() => import('@/components/shelf/ShelfCheckinSheet'), {
  ssr: false,
});

type Props = {
  bookId: string;
  initialSectionId?: string | null;
  initialPageIndex?: number | null;
  presetGroupId?: string | null;
};

export default function ShelfReader({
  bookId,
  initialSectionId,
  initialPageIndex,
  presetGroupId,
}: Props) {
  const flashToast = useToast();
  const [book, setBook] = useState<ShelfBookDetail | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(initialSectionId ?? null);
  const [section, setSection] = useState<ShelfSection | null>(null);
  const [prevSection, setPrevSection] = useState<ShelfSection | null>(null);
  const [nextSection, setNextSection] = useState<ShelfSection | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pendingLastPage, setPendingLastPage] = useState(false);
  const [pendingScrollEnd, setPendingScrollEnd] = useState(false);
  const [flowScrollRatio, setFlowScrollRatio] = useState(0);
  const [pdfFullscreen, setPdfFullscreen] = useState(false);
  const { fontPx, lineHeight, setFontPx, setLineHeight, setFontFamily } = useShelfReadingPrefs();
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageBySectionRef = useRef<Record<string, number>>({});
  const scrollBySectionRef = useRef<Record<string, number>>({});
  const pageCountBySectionRef = useRef<Record<string, number>>({});
  const hintShownRef = useRef(false);

  const isLesson = section?.kind === 'lesson';
  const contentKey = `${bookId}:${sectionId}:${fontPx}:${lineHeight}`;

  const isPdfSection = shelfSectionIsPdf(section);
  const isFlowSection = Boolean(section) && !isPdfSection;

  const sections = book?.sections ?? [];
  const sectionIndex = useMemo(
    () => sections.findIndex((s) => s.id === sectionId),
    [sections, sectionId],
  );

  const canPrevSection = sectionIndex > 0;
  const canNextSection = sectionIndex >= 0 && sectionIndex < sections.length - 1;
  const canPrev = canPrevSection;
  const canNext = canNextSection;

  useEffect(() => {
    setShelfReaderChrome(true);
    notifyFlutterShelfPath();
    return () => {
      setShelfReaderChrome(false);
    };
  }, [bookId, sectionId]);

  const neighborId = useCallback(
    (delta: number) => {
      const idx = sectionIndex + delta;
      if (idx < 0 || idx >= sections.length) return null;
      return sections[idx]?.id ?? null;
    },
    [sectionIndex, sections],
  );

  const syncNeighborsFromCache = useCallback(
    (currentId: string | null) => {
      if (!currentId) {
        setPrevSection(null);
        setNextSection(null);
        return;
      }
      const prevId = neighborId(-1);
      const nextId = neighborId(1);
      setPrevSection(prevId ? peekShelfSectionCache(bookId, prevId) : null);
      setNextSection(nextId ? peekShelfSectionCache(bookId, nextId) : null);
    },
    [bookId, neighborId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    getPlatformShelfBook(bookId)
      .then((detail) => {
        if (cancelled) return;
        setBook(detail);
        const saved = loadShelfBookProgress(bookId);
        const first = detail.sections?.[0]?.id ?? null;
        const pick = initialSectionId || saved?.sectionId || first;
        setSectionId(pick);
        if (pick && saved) {
          pageBySectionRef.current[pick] = saved.pageIndex ?? 0;
          if (typeof saved.scrollOffset === 'number') {
            scrollBySectionRef.current[pick] = saved.scrollOffset;
          }
          setPageIndex(saved.pageIndex ?? 0);
          setFlowScrollRatio(saved.scrollOffset ?? 0);
        } else if (
          pick &&
          initialSectionId &&
          pick === initialSectionId &&
          typeof initialPageIndex === 'number'
        ) {
          pageBySectionRef.current[pick] = initialPageIndex;
          setPageIndex(initialPageIndex);
        }
      })
      .catch(() => {
        if (!cancelled) setErr('无法加载书目');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, initialSectionId, initialPageIndex]);

  useEffect(() => {
    if (!sectionId) return;
    let cancelled = false;

    const cached = peekShelfSectionCache(bookId, sectionId);
    if (cached) {
      setSection(cached);
      setSectionLoading(false);
      syncNeighborsFromCache(sectionId);
    } else {
      setSectionLoading(true);
    }

    getPlatformShelfSection(bookId, sectionId)
      .then((s) => {
        if (cancelled) return;
        setSection(s);
        setSectionLoading(false);
        syncNeighborsFromCache(sectionId);
        const nextId = neighborId(1);
        prefetchShelfSection(bookId, nextId);
      })
      .catch(() => {
        if (!cancelled) {
          setErr('无法加载章节');
          setSectionLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, sectionId, neighborId, syncNeighborsFromCache]);

  useEffect(() => {
    if (!sectionId || !book?.title) return;
    const ref = buildShelfCheckinRef(bookId, sectionId);
    rememberShelfRefLabel(ref, formatShelfCheckinLabel(book.title, section?.title || ''));
  }, [bookId, sectionId, book?.title, section?.title]);

  useEffect(() => {
    if (!sectionId) return;
    if (pendingLastPage || pendingScrollEnd) return;
    const savedPage = pageBySectionRef.current[sectionId];
    const savedScroll = scrollBySectionRef.current[sectionId];
    setPageIndex(typeof savedPage === 'number' ? savedPage : 0);
    setFlowScrollRatio(typeof savedScroll === 'number' ? savedScroll : 0);
  }, [sectionId, pendingLastPage, pendingScrollEnd]);

  useEffect(() => {
    if (pendingScrollEnd) {
      const t = window.setTimeout(() => setPendingScrollEnd(false), 400);
      return () => window.clearTimeout(t);
    }
  }, [pendingScrollEnd, sectionId, contentKey]);

  useEffect(() => {
    if (pendingLastPage && pageCount > 0) {
      setPageIndex(Math.max(0, pageCount - 1));
      setPendingLastPage(false);
    }
  }, [pendingLastPage, pageCount]);

  useEffect(() => {
    setPageCount(1);
  }, [sectionId, contentKey]);

  const overlayOpen = tocOpen || fontOpen || shareOpen || pdfFullscreen;

  const setPageCountForSection = useCallback(
    (count: number) => {
      setPageCount(count);
      if (sectionId) pageCountBySectionRef.current[sectionId] = count;
    },
    [sectionId],
  );

  useEffect(() => {
    if (pageIndex >= pageCount) {
      setPageIndex(Math.max(0, pageCount - 1));
    }
  }, [pageIndex, pageCount]);

  useEffect(() => {
    if (!sectionId) return;
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(() => {
      saveShelfProgress(
        bookId,
        sectionId,
        { bookTitle: book?.title, sectionTitle: section?.title },
        isPdfSection
          ? { pageIndex }
          : { scrollOffset: flowScrollRatio, pageIndex: 0 },
      );
      pageBySectionRef.current[sectionId] = pageIndex;
      scrollBySectionRef.current[sectionId] = flowScrollRatio;
    }, 350);
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, [bookId, sectionId, book?.title, section?.title, pageIndex, flowScrollRatio, isPdfSection]);

  useEffect(() => {
    if (!section || hintShownRef.current) return;
    hintShownRef.current = true;
    maybeShowShelfReadingHint(flashToast);
  }, [section, flashToast]);

  const prefetchNeighbor = useCallback(
    (delta: number) => {
      const id = neighborId(delta);
      if (!id) return;
      void getPlatformShelfSection(bookId, id)
        .then((s) => {
          if (delta < 0) setPrevSection(s);
          else setNextSection(s);
        })
        .catch(() => {});
    },
    [bookId, neighborId],
  );

  const goSection = useCallback(
    (id: string | null, opts?: { page?: number | 'last'; scroll?: 'start' | 'end' }) => {
      if (!id) return;
      if (sectionId) {
        pageBySectionRef.current[sectionId] = pageIndex;
        scrollBySectionRef.current[sectionId] = flowScrollRatio;
      }
      setSectionId(id);
      setTocOpen(false);
      setChromeHidden(false);
      setPdfFullscreen(false);
      if (opts?.page === 'last' || opts?.scroll === 'end') {
        setPendingLastPage(true);
        setPendingScrollEnd(true);
        setPageIndex(0);
        setFlowScrollRatio(1);
      } else if (typeof opts?.page === 'number') {
        setPageIndex(opts.page);
        pageBySectionRef.current[id] = opts.page;
        setFlowScrollRatio(0);
        scrollBySectionRef.current[id] = 0;
      } else if (opts?.scroll === 'start') {
        setPageIndex(0);
        setFlowScrollRatio(0);
        scrollBySectionRef.current[id] = 0;
      } else {
        const savedPage = pageBySectionRef.current[id];
        const savedScroll = scrollBySectionRef.current[id];
        setPageIndex(typeof savedPage === 'number' ? savedPage : 0);
        setFlowScrollRatio(typeof savedScroll === 'number' ? savedScroll : 0);
      }
    },
    [sectionId, pageIndex, flowScrollRatio],
  );

  const goPrevSection = useCallback(() => {
    if (sectionIndex > 0) {
      const prev = sections[sectionIndex - 1];
      goSection(prev?.id ?? null, { page: 'last', scroll: 'end' });
      if (prev?.title) flashToast(`已进入：${prev.title}`);
    }
  }, [goSection, sectionIndex, sections, flashToast]);

  const goNextSection = useCallback(() => {
    if (sectionIndex >= 0 && sectionIndex < sections.length - 1) {
      const next = sections[sectionIndex + 1];
      goSection(next?.id ?? null, { page: 0, scroll: 'start' });
      if (next?.title) flashToast(`已进入：${next.title}`);
    }
  }, [goSection, sectionIndex, sections, flashToast]);

  const resolveTurn = useCallback(
    (delta: 1 | -1): ShelfTurnKind => {
      if (delta > 0 && canNextSection) return 'section';
      if (delta < 0 && canPrevSection) return 'section';
      return 'none';
    },
    [canNextSection, canPrevSection],
  );

  const pageTurn = useShelfTurn({
    enabled: Boolean(section) && !overlayOpen,
    canPrev,
    canNext,
    blocked: overlayOpen,
    snapOnly: true,
    resolveTurn,
    onSectionChange: (delta) => {
      if (delta > 0) goNextSection();
      else goPrevSection();
    },
    onDragApproach: prefetchNeighbor,
    onBoundary: (edge) => {
      flashToast(edge === 'next' ? '已是最后一节' : '已是第一节');
      try {
        navigator.vibrate?.(10);
      } catch {
        /* ignore */
      }
    },
  });

  const tocGroups = useMemo(
    () => buildShelfTocGroups(book?.toc, book?.book_type),
    [book?.toc, book?.book_type],
  );

  const showBottomBar = !chromeHidden && !tocOpen && !fontOpen && !shareOpen && !pdfFullscreen;

  const onContentTap = useCallback(() => {
    setChromeHidden((v) => !v);
  }, []);

  const flowEdgeHandlers = useCallback(
    (edge: 'prev' | 'next') => {
      if (edge === 'next') goNextSection();
      else goPrevSection();
    },
    [goNextSection, goPrevSection],
  );

  const onFlowScrollProgress = useCallback((ratio: number) => {
    setFlowScrollRatio(ratio);
  }, []);

  const renderSectionContent = (
    sec: ShelfSection | null,
    interactive: boolean,
    opts?: { scrollToEnd?: boolean },
  ) => {
    if (!sec) return null;
    if (sec.kind === 'lesson') {
      return (
        <ShelfLessonPanel
          bookId={bookId}
          section={sec}
          contentKey={`${bookId}:${sec.id}:${fontPx}:${lineHeight}`}
          pageIndex={interactive ? pageIndex : 0}
          scrollOffset={
            interactive ? (scrollBySectionRef.current[sec.id] ?? flowScrollRatio) : 0
          }
          scrollToEnd={interactive ? Boolean(opts?.scrollToEnd) : false}
          onPageCount={interactive && shelfSectionIsPdf(sec) ? setPageCountForSection : undefined}
          onPageIndexChange={interactive && shelfSectionIsPdf(sec) ? setPageIndex : undefined}
          onScrollProgress={interactive && !shelfSectionIsPdf(sec) ? onFlowScrollProgress : undefined}
          onSectionEdge={interactive ? flowEdgeHandlers : undefined}
          canPrevSection={canPrevSection}
          canNextSection={canNextSection}
          onTap={interactive ? onContentTap : undefined}
          pdfFullscreen={interactive && pdfFullscreen}
          onExitPdfFullscreen={interactive ? () => setPdfFullscreen(false) : undefined}
          onOpenPdfFullscreen={interactive ? () => setPdfFullscreen(true) : undefined}
        />
      );
    }
    if (sec.html) {
      return (
        <ShelfPaginatedProse
          html={sec.html}
          contentKey={`${bookId}:${sec.id}:${fontPx}:${lineHeight}`}
          scrollOffset={interactive ? (scrollBySectionRef.current[sec.id] ?? flowScrollRatio) : 0}
          scrollToEnd={interactive ? Boolean(opts?.scrollToEnd) : false}
          onScrollProgress={interactive ? onFlowScrollProgress : undefined}
          onSectionEdge={interactive ? flowEdgeHandlers : undefined}
          canPrevSection={canPrevSection}
          canNextSection={canNextSection}
          onTap={interactive ? onContentTap : undefined}
        />
      );
    }
    return <p className="muted shelf-lesson-empty">暂无内容</p>;
  };

  const backBar = (
    <PageBackBar href="/shelf" className="shelf-nav-back" ariaLabel="返回书架" />
  );

  if (loading && !book) {
    return (
      <main className="shelf-reader">
        <div className="shelf-reader-top">
          {backBar}
          <h1>加载中…</h1>
        </div>
      </main>
    );
  }

  if (err && !book) {
    return (
      <main className="shelf-reader">
        <div className="shelf-reader-top">
          {backBar}
          <h1>{err}</h1>
        </div>
      </main>
    );
  }

  const title = section?.title || book?.title || '阅读';

  return (
    <main
      className={[
        'shelf-reader',
        chromeHidden ? 'shelf-reader-hidden' : '',
        isLesson ? 'shelf-reader-lesson' : '',
        isPdfSection ? 'shelf-reader-pdf-scroll' : '',
        isFlowSection ? 'shelf-reader-flow-scroll' : '',
        pageTurn.turning ? 'shelf-reader-turning' : '',
        pdfFullscreen ? 'shelf-reader-pdf-fullscreen' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={shelfReadingStyleVars(fontPx, lineHeight)}
    >
      {!pdfFullscreen ? (
        <header className="shelf-reader-top">
          {backBar}
          <div className="shelf-reader-title-wrap">
            {section?.unit ? <span className="shelf-reader-unit">{section.unit}</span> : null}
            <h1>{title}</h1>
          </div>
        </header>
      ) : null}

      {section ? (
        <div
          className={`shelf-turn-viewport${pageTurn.turning ? ' is-turning' : ''}`}
          ref={pageTurn.viewportRef}
          onPointerDown={pageTurn.onPointerDown}
          onPointerMove={pageTurn.onPointerMove}
          onPointerUp={pageTurn.onPointerUp}
          onPointerCancel={pageTurn.onPointerCancel}
        >
          {sectionLoading && !pageTurn.turning ? (
            <p className="shelf-section-loading muted" role="status">
              加载中…
            </p>
          ) : null}
          <div className="shelf-turn-track" ref={pageTurn.trackRef}>
            <div className="shelf-turn-panel shelf-turn-panel-peek">
              {renderSectionContent(prevSection, false, { scrollToEnd: true })}
            </div>
            <div className="shelf-turn-panel shelf-turn-panel-active">
              {renderSectionContent(section, true, { scrollToEnd: pendingScrollEnd })}
            </div>
            <div className="shelf-turn-panel shelf-turn-panel-peek">
              {renderSectionContent(nextSection, false)}
            </div>
          </div>
        </div>
      ) : (
        <div className="shelf-reader-body shelf-reader-body-pick">
          <p className="muted">{sectionLoading ? '加载中…' : '暂无内容'}</p>
        </div>
      )}

      {showBottomBar ? (
        <nav className="shelf-reader-bottom" aria-label="阅读工具">
          <button type="button" className="shelf-reader-bottom-btn" aria-label="目录" onClick={() => setTocOpen(true)}>
            <span className="shelf-reader-bottom-icon" aria-hidden>☰</span>
            <span>目录</span>
          </button>
          <button type="button" className="shelf-reader-bottom-btn" aria-label="字体设置" onClick={() => setFontOpen(true)}>
            <span className="shelf-reader-bottom-icon" aria-hidden>Aa</span>
            <span>字体</span>
          </button>
          <span className="shelf-reader-bottom-spacer" aria-hidden />
          <button
            type="button"
            className="shelf-reader-bottom-btn shelf-reader-bottom-btn-share"
            aria-label="分享到共读群"
            disabled={!sectionId}
            onClick={() => setShareOpen(true)}
          >
            <span className="shelf-reader-bottom-icon" aria-hidden>↗</span>
            <span>分享</span>
          </button>
        </nav>
      ) : null}

      {isPdfSection && pageCount > 1 && !chromeHidden && !pdfFullscreen ? (
        <div className="shelf-page-indicator" aria-live="polite">
          {pageIndex + 1} / {pageCount}
        </div>
      ) : null}

      {isFlowSection && !chromeHidden && !pdfFullscreen ? (
        <div className="shelf-read-progress" aria-hidden>
          <div
            className="shelf-read-progress-fill"
            style={{ width: `${Math.round(flowScrollRatio * 100)}%` }}
          />
        </div>
      ) : null}

      {tocOpen ? (
        <div className="shelf-toc-sheet" role="dialog" aria-modal="true" aria-label="目录" onClick={() => setTocOpen(false)}>
          <div className="shelf-toc-panel" onClick={(e) => e.stopPropagation()}>
            <div className="shelf-toc-head">
              <strong>{book?.title}</strong>
              <button type="button" className="icon-btn" aria-label="关闭" onClick={() => setTocOpen(false)}>✕</button>
            </div>
            <div className="shelf-toc-list">
              {tocGroups.map((group) => (
                <div key={group.key}>
                  {tocGroups.length > 1 ? <div className="shelf-toc-group">{group.label}</div> : null}
                  {group.items.map((item) => {
                    if (item.level === 1 && !item.section_id) {
                      return (
                        <div key={item.id} className="shelf-toc-unit">
                          {shelfTocDisplayTitle(item)}
                        </div>
                      );
                    }
                    const sid = resolveSectionId(item, sections);
                    const active = sid === sectionId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`shelf-toc-item level-${item.level}${active ? ' is-active' : ''}`}
                        disabled={!sid}
                        onClick={() => {
                          const sid = resolveSectionId(item, sections);
                          if (!sid) return;
                          goSection(sid);
                        }}
                      >
                        {shelfTocDisplayTitle(item)}
                        {!sid ? <span className="shelf-toc-tag">无正文</span> : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <ShelfFontSheet
        open={fontOpen}
        fontPx={fontPx}
        lineHeight={lineHeight}
        onClose={() => setFontOpen(false)}
        onFontChange={setFontPx}
        onLineHeightChange={setLineHeight}
        onFontFamilyChange={setFontFamily}
      />

      {shareOpen && sectionId ? (
        <ShelfCheckinSheet
          bookId={bookId}
          bookTitle={book?.title || ''}
          sectionId={sectionId}
          sectionTitle={section?.title || ''}
          pageIndex={pageIndex}
          presetGroupId={presetGroupId}
          onClose={() => setShareOpen(false)}
          onDone={() => flashToast('已分享到共读群')}
        />
      ) : null}
    </main>
  );
}
