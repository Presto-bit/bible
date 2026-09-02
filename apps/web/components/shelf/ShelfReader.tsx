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
  const [pdfFullscreen, setPdfFullscreen] = useState(false);
  const { fontPx, lineHeight, setFontPx, setLineHeight, setFontFamily } = useShelfReadingPrefs();
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageBySectionRef = useRef<Record<string, number>>({});
  const pageCountBySectionRef = useRef<Record<string, number>>({});

  const isLesson = section?.kind === 'lesson';
  const contentKey = `${bookId}:${sectionId}:${fontPx}:${lineHeight}`;

  const isPdfSection = useMemo(() => {
    const p = section?.primary;
    if (!p?.storage_key) return false;
    const mime = p.mime || '';
    return mime.includes('pdf') || p.storage_key.toLowerCase().endsWith('.pdf');
  }, [section?.primary]);

  const sections = book?.sections ?? [];
  const sectionIndex = useMemo(
    () => sections.findIndex((s) => s.id === sectionId),
    [sections, sectionId],
  );

  const canPrevSection = sectionIndex > 0;
  const canNextSection = sectionIndex >= 0 && sectionIndex < sections.length - 1;
  const canPrev = isPdfSection ? canPrevSection : pageIndex > 0 || canPrevSection;
  const canNext = isPdfSection ? canNextSection : pageIndex < pageCount - 1 || canNextSection;

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
        if (pick && typeof saved?.pageIndex === 'number') {
          pageBySectionRef.current[pick] = saved.pageIndex;
          setPageIndex(saved.pageIndex);
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
    if (pendingLastPage) return;
    const saved = pageBySectionRef.current[sectionId];
    setPageIndex(typeof saved === 'number' ? saved : 0);
  }, [sectionId]);

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
        pageIndex,
      );
      pageBySectionRef.current[sectionId] = pageIndex;
    }, 350);
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, [bookId, sectionId, book?.title, section?.title, pageIndex]);

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
    (id: string | null, opts?: { page?: number | 'last' }) => {
      if (!id) return;
      if (sectionId) pageBySectionRef.current[sectionId] = pageIndex;
      setSectionId(id);
      setTocOpen(false);
      setChromeHidden(false);
      setPdfFullscreen(false);
      if (opts?.page === 'last') {
        setPendingLastPage(true);
      } else if (typeof opts?.page === 'number') {
        setPageIndex(opts.page);
        pageBySectionRef.current[id] = opts.page;
      } else {
        const saved = pageBySectionRef.current[id];
        setPageIndex(typeof saved === 'number' ? saved : 0);
      }
    },
    [sectionId, pageIndex],
  );

  const goPrevSection = useCallback(() => {
    if (sectionIndex > 0) {
      goSection(sections[sectionIndex - 1]?.id ?? null, { page: 'last' });
    }
  }, [goSection, sectionIndex, sections]);

  const goNextSection = useCallback(() => {
    if (sectionIndex >= 0 && sectionIndex < sections.length - 1) {
      goSection(sections[sectionIndex + 1]?.id ?? null, { page: 0 });
    }
  }, [goSection, sectionIndex, sections]);

  const resolveTurn = useCallback(
    (delta: 1 | -1): ShelfTurnKind => {
      if (isPdfSection) {
        if (delta > 0 && canNextSection) return 'section';
        if (delta < 0 && canPrevSection) return 'section';
        return 'none';
      }
      if (delta > 0) {
        if (pageIndex < pageCount - 1) return 'page';
        if (canNextSection) return 'section';
        return 'none';
      }
      if (pageIndex > 0) return 'page';
      if (canPrevSection) return 'section';
      return 'none';
    },
    [isPdfSection, pageIndex, pageCount, canNextSection, canPrevSection],
  );

  const pageTurn = useShelfTurn({
    enabled: Boolean(section) && !overlayOpen,
    canPrev,
    canNext,
    blocked: overlayOpen,
    snapOnly: true,
    resolveTurn,
    onPageChange: (delta) => {
      setPageIndex((i) => Math.max(0, Math.min(pageCount - 1, i + delta)));
    },
    onSectionChange: (delta) => {
      if (delta > 0) goNextSection();
      else goPrevSection();
    },
    onDragApproach: prefetchNeighbor,
    onBoundary: (edge) => {
      flashToast(edge === 'next' ? '已是最后一页' : '已是第一页');
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

  const renderSectionContent = (
    sec: ShelfSection | null,
    idx: number,
    interactive: boolean,
  ) => {
    if (!sec) return null;
    if (sec.kind === 'lesson') {
      return (
        <ShelfLessonPanel
          bookId={bookId}
          section={sec}
          pageIndex={idx}
          contentKey={`${bookId}:${sec.id}:${fontPx}:${lineHeight}`}
          onPageCount={interactive ? setPageCountForSection : undefined}
          onPageIndexChange={interactive ? setPageIndex : undefined}
          onSectionEdge={
            interactive
              ? (edge) => {
                  if (edge === 'next') goNextSection();
                  else goPrevSection();
                }
              : undefined
          }
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
          pageIndex={idx}
          onPageCount={interactive ? setPageCountForSection : undefined}
          onTap={interactive ? onContentTap : undefined}
        />
      );
    }
    return <p className="muted shelf-lesson-empty">暂无内容</p>;
  };

  const backBar = (
    <PageBackBar href="/shelf" className="shelf-nav-back" ariaLabel="返回书架" />
  );

  const prevPeekPageIndex = useMemo(() => {
    const prevId = neighborId(-1);
    if (!prevId) return 0;
    const pc = pageCountBySectionRef.current[prevId] ?? 1;
    return Math.max(0, pc - 1);
  }, [neighborId, prevSection, pageCount]);

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
              {renderSectionContent(prevSection, prevPeekPageIndex, false)}
            </div>
            <div className="shelf-turn-panel shelf-turn-panel-active">
              {renderSectionContent(section, pageIndex, true)}
            </div>
            <div className="shelf-turn-panel shelf-turn-panel-peek">
              {renderSectionContent(nextSection, 0, false)}
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

      {pageCount > 1 && !chromeHidden && !pdfFullscreen ? (
        <div className="shelf-page-indicator" aria-live="polite">
          {pageIndex + 1} / {pageCount}
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
                          const saved = pageBySectionRef.current[sid];
                          goSection(sid, { page: typeof saved === 'number' ? saved : 0 });
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
