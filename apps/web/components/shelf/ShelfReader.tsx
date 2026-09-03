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
  type ShelfAttachment,
} from '@/lib/shelf_api';
import ShelfMediaSheet from '@/components/shelf/ShelfMediaSheet';
import { shelfLessonMedia } from '@/lib/shelf_lesson_media';
import { useShelfReadingPrefs } from '@/components/shelf/ShelfReadingBar';
import ShelfFontSheet from '@/components/shelf/ShelfFontSheet';
import ShelfPaginatedProse from '@/components/shelf/ShelfPaginatedProse';
import { shelfReadingStyleVars } from '@/lib/shelf_reading';
import { buildShelfTocGroups, resolveSectionId, shelfTocDisplayTitle } from '@/lib/shelf_toc';
import { buildShelfCheckinRef, formatShelfCheckinLabel, rememberShelfRefLabel } from '@/lib/shelf_checkin';
import {
  fetchSectionPublicNotes,
  type ShelfPost,
} from '@/lib/shelf_posts';
import { shelfSectionIsPdf, shelfIsChildrenLessonBook } from '@/lib/shelf_reader_contract';
import { touchShelfBookLastRead } from '@/lib/shelf_library';
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

const ShelfReaderMoreSheet = dynamic(() => import('@/components/shelf/ShelfReaderMoreSheet'), {
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
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaVideo, setMediaVideo] = useState<ShelfAttachment | null>(null);
  const [pdfPinching, setPdfPinching] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [publicNotes, setPublicNotes] = useState<ShelfPost[]>([]);
  const { fontPx, lineHeight, setFontPx, setLineHeight, setFontFamily } = useShelfReadingPrefs();
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flowProgressTimerRef = useRef<number | null>(null);
  const pageBySectionRef = useRef<Record<string, number>>({});
  const scrollBySectionRef = useRef<Record<string, number>>({});
  const scrollAnchorBySectionRef = useRef<Record<string, { paragraphIndex: number }>>({});
  const pageCountBySectionRef = useRef<Record<string, number>>({});
  const flowScrollAnchorRef = useRef<{ paragraphIndex: number } | null>(null);

  const isLesson = section?.kind === 'lesson';
  const isChildrenLesson = shelfIsChildrenLessonBook(book);
  const lessonMedia = useMemo(
    () => (section && isLesson ? shelfLessonMedia(section) : null),
    [section, isLesson],
  );
  const hasLessonMedia = Boolean(
    lessonMedia
    && (lessonMedia.images.length > 0 || lessonMedia.videos.length > 0 || lessonMedia.audios.length > 0),
  );
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
          if (saved.scrollAnchor) {
            scrollAnchorBySectionRef.current[pick] = saved.scrollAnchor;
            flowScrollAnchorRef.current = saved.scrollAnchor;
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

  const overlayOpen = tocOpen || fontOpen || shareOpen || mediaOpen || pdfPinching || moreOpen;

  useEffect(() => {
    if (!sectionId) {
      setPublicNotes([]);
      return;
    }
    let cancelled = false;
    void fetchSectionPublicNotes(bookId, sectionId)
      .then((data) => {
        if (!cancelled) setPublicNotes(data.items);
      })
      .catch(() => {
        if (!cancelled) setPublicNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, sectionId]);

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
      const sectionIdx = Math.max(0, sectionIndex);
      const totalSections = Math.max(1, sections.length);
      const progressRatio = isPdfSection
        ? Math.min(1, (pageIndex + 1) / Math.max(1, pageCount))
        : Math.min(1, (sectionIdx + flowScrollRatio) / totalSections);
      saveShelfProgress(
        bookId,
        sectionId,
        { bookTitle: book?.title, sectionTitle: section?.title },
        isPdfSection
          ? { pageIndex, progressRatio }
          : {
              scrollOffset: flowScrollRatio,
              pageIndex: 0,
              scrollAnchor: flowScrollAnchorRef.current ?? undefined,
              progressRatio,
            },
      );
      touchShelfBookLastRead(bookId);
      pageBySectionRef.current[sectionId] = pageIndex;
      scrollBySectionRef.current[sectionId] = flowScrollRatio;
    }, 350);
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, [
    bookId,
    sectionId,
    book?.title,
    section?.title,
    pageIndex,
    flowScrollRatio,
    isPdfSection,
    sectionIndex,
    sections.length,
    pageCount,
  ]);

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
      const id = prev?.id ?? null;
      if (!id) return;
      const visited =
        scrollBySectionRef.current[id] != null
        || scrollAnchorBySectionRef.current[id] != null
        || pageBySectionRef.current[id] != null;
      goSection(id, visited ? undefined : { page: 'last', scroll: 'end' });
    }
  }, [goSection, sectionIndex, sections]);

  const goNextSection = useCallback(() => {
    if (sectionIndex >= 0 && sectionIndex < sections.length - 1) {
      const next = sections[sectionIndex + 1];
      const id = next?.id ?? null;
      if (!id) return;
      const visited =
        scrollBySectionRef.current[id] != null
        || scrollAnchorBySectionRef.current[id] != null
        || pageBySectionRef.current[id] != null;
      goSection(id, visited ? undefined : { page: 0, scroll: 'start' });
    }
  }, [goSection, sectionIndex, sections]);

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
    snapOnly: false,
    edgeOnly: false,
    resolveTurn,
    onSectionChange: (delta) => {
      if (delta > 0) goNextSection();
      else goPrevSection();
    },
    onDragApproach: prefetchNeighbor,
    onBoundary: () => {
      try {
        navigator.vibrate?.(10);
      } catch {
        /* ignore */
      }
    },
  });

  const onTextSelectionChange = useCallback((active: boolean) => {
    if (active) pageTurn.cancelDrag();
  }, [pageTurn]);

  const tocGroups = useMemo(
    () => buildShelfTocGroups(book?.toc, book?.book_type),
    [book?.toc, book?.book_type],
  );

  const showBottomBar = !chromeHidden && !tocOpen && !fontOpen && !shareOpen && !moreOpen;

  const onContentTap = useCallback(() => {
    setChromeHidden((v) => !v);
  }, []);

  useEffect(() => {
    if (!chromeHidden) return;
    setMediaOpen(false);
    setMediaVideo(null);
  }, [chromeHidden]);

  const onFlowScrollProgress = useCallback((ratio: number) => {
    if (sectionId) scrollBySectionRef.current[sectionId] = ratio;
    if (flowProgressTimerRef.current != null) return;
    flowProgressTimerRef.current = window.setTimeout(() => {
      flowProgressTimerRef.current = null;
      setFlowScrollRatio(ratio);
    }, 120);
  }, [sectionId]);

  const onFlowScrollAnchor = useCallback((anchor: { paragraphIndex: number }) => {
    flowScrollAnchorRef.current = anchor;
    if (sectionId) scrollAnchorBySectionRef.current[sectionId] = anchor;
  }, [sectionId]);

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
          childrenLesson={isChildrenLesson}
          contentKey={`${bookId}:${sec.id}:${fontPx}:${lineHeight}`}
          pageIndex={interactive ? pageIndex : 0}
          scrollOffset={
            interactive ? (scrollBySectionRef.current[sec.id] ?? flowScrollRatio) : 0
          }
          scrollAnchor={
            interactive ? (scrollAnchorBySectionRef.current[sec.id] ?? flowScrollAnchorRef.current ?? undefined) : undefined
          }
          scrollToEnd={interactive ? Boolean(opts?.scrollToEnd) : false}
          onPageCount={interactive && shelfSectionIsPdf(sec) ? setPageCountForSection : undefined}
          onPageIndexChange={interactive && shelfSectionIsPdf(sec) ? setPageIndex : undefined}
          onScrollProgress={interactive && !shelfSectionIsPdf(sec) ? onFlowScrollProgress : undefined}
          onScrollAnchor={interactive && !shelfSectionIsPdf(sec) ? onFlowScrollAnchor : undefined}
          onTap={interactive ? onContentTap : undefined}
          chromeHidden={interactive && chromeHidden}
          onPdfPinchActive={interactive ? setPdfPinching : undefined}
          onTextSelectionChange={interactive ? onTextSelectionChange : undefined}
          onOpenMedia={interactive && hasLessonMedia ? () => setMediaOpen(true) : undefined}
          onOpenVideo={
            interactive && hasLessonMedia
              ? (item) => {
                  setMediaVideo(item);
                  setMediaOpen(true);
                }
              : undefined
          }
        />
      );
    }
    if (sec.html) {
      const flowVariant =
        sec.kind === 'epub' ||
        sec.html.includes('shelf-docx-root') ||
        sec.html.includes('shelf-epub-root')
          ? 'docx'
          : 'html';
      return (
        <ShelfPaginatedProse
          html={sec.html}
          bookId={bookId}
          sectionId={sec.id}
          pageIndex={0}
          variant={flowVariant}
          contentKey={`${bookId}:${sec.id}:${fontPx}:${lineHeight}`}
          scrollOffset={interactive ? (scrollBySectionRef.current[sec.id] ?? flowScrollRatio) : 0}
          scrollAnchor={
            interactive ? (scrollAnchorBySectionRef.current[sec.id] ?? flowScrollAnchorRef.current ?? undefined) : undefined
          }
          scrollToEnd={interactive ? Boolean(opts?.scrollToEnd) : false}
          onScrollProgress={interactive ? onFlowScrollProgress : undefined}
          onScrollAnchor={interactive ? onFlowScrollAnchor : undefined}
          onTap={interactive ? onContentTap : undefined}
          chromeHidden={interactive && chromeHidden}
          onTextSelectionChange={interactive ? onTextSelectionChange : undefined}
          publicNotes={interactive ? publicNotes : []}
          onPublicNotesChanged={() => {
            if (!sectionId) return;
            void fetchSectionPublicNotes(bookId, sectionId).then((d) => setPublicNotes(d.items));
          }}
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
      ]
        .filter(Boolean)
        .join(' ')}
      style={shelfReadingStyleVars(fontPx, lineHeight)}
    >
      <header className="shelf-reader-top">
          {backBar}
          <div className="shelf-reader-title-wrap">
            {section?.unit ? <span className="shelf-reader-unit">{section.unit}</span> : null}
            <h1>{title}</h1>
          </div>
        </header>

      {section ? (
        <div
          className={`shelf-turn-viewport${pageTurn.turning ? ' is-turning' : ''}`}
          ref={pageTurn.viewportRef}
          {...pageTurn.turnHandlers}
        >
          {sectionLoading && !pageTurn.turning ? (
            <p className="shelf-section-loading muted" role="status">
              加载中…
            </p>
          ) : null}
          <div className="shelf-turn-track" ref={pageTurn.trackRef}>
            <div className="shelf-turn-panel shelf-turn-panel-peek" aria-hidden />
            <div className="shelf-turn-panel shelf-turn-panel-active">
              {renderSectionContent(section, true, { scrollToEnd: pendingScrollEnd })}
            </div>
            <div className="shelf-turn-panel shelf-turn-panel-peek" aria-hidden />
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
          <button
            type="button"
            className="shelf-reader-bottom-btn"
            aria-label="评论"
            disabled={!sectionId}
            onClick={() => setMoreOpen(true)}
          >
            <span className="shelf-reader-bottom-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 3V11.5A8.5 8.5 0 0 1 11.5 3h1A8.5 8.5 0 0 1 21 11.5z" />
              </svg>
            </span>
            <span>评论</span>
          </button>
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

      {isPdfSection && pageCount > 1 && !chromeHidden ? (
        <div className="shelf-page-indicator" aria-live="polite">
          {pageIndex + 1} / {pageCount}
        </div>
      ) : null}

      {isFlowSection && !chromeHidden ? (
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

      {hasLessonMedia && lessonMedia ? (
        <ShelfMediaSheet
          open={mediaOpen}
          bookId={bookId}
          images={lessonMedia.images}
          videos={lessonMedia.videos}
          audios={lessonMedia.audios}
          initialVideo={mediaVideo}
          onVideoConsumed={() => setMediaVideo(null)}
          onClose={() => {
            setMediaOpen(false);
            setMediaVideo(null);
          }}
        />
      ) : null}

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

      {moreOpen && sectionId ? (
        <ShelfReaderMoreSheet
          bookId={bookId}
          bookTitle={book?.title || ''}
          sectionTitle={section?.title}
          sectionId={sectionId}
          pageIndex={pageIndex}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}
    </main>
  );
}
