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
import ShelfFocusBar from '@/components/shelf/ShelfFocusBar';
import {
  addThought,
  updateThought,
  type ThoughtRow,
  type ThoughtVisibility,
} from '@/lib/reader_thoughts';
import {
  getHighlightMap,
  removeHighlight,
  setHighlight,
  type HighlightColor,
} from '@/lib/reader_highlights';
import { buildShelfMarkRef, formatShelfMarkRefLabel } from '@/lib/shelf_mark_ref';
import {
  clearShelfTextSelection,
  readShelfTextSelection,
  type ShelfTextSelection,
} from '@/lib/shelf_selection';
import { findShelfHighlightRef, pickShelfHighlight } from '@/lib/shelf_highlight_paint';
import { notifyLocalDataChanged, subscribeLocalDataChanged } from '@/lib/local_data_events';

const ThoughtWriteSheet = dynamic(() => import('@/components/reader/ThoughtWriteSheet'), {
  ssr: false,
});
const ThoughtHubSheet = dynamic(() => import('@/components/reader/ThoughtHubSheet'), {
  ssr: false,
});

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

export default function ShelfReader({ bookId, initialSectionId, initialPageIndex, presetGroupId }: Props) {
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
  const [annotationRevision, setAnnotationRevision] = useState(0);
  const [textSelection, setTextSelection] = useState<ShelfTextSelection | null>(null);
  const [selectionRefStr, setSelectionRefStr] = useState('');
  const [markPaletteOpen, setMarkPaletteOpen] = useState(false);
  const [highlightMap, setHighlightMap] = useState<ReturnType<typeof getHighlightMap>>({});
  const [thoughtHub, setThoughtHub] = useState<null | {
    ref: string;
    label: string;
    text: string;
  }>(null);
  const [thoughtWrite, setThoughtWrite] = useState<null | {
    ref: string;
    label: string;
    verseText?: string;
    mode: 'new' | 'edit';
    thoughtId?: string;
    initialBody?: string;
    initialVisibility?: ThoughtVisibility;
    returnHub?: { ref: string; label: string; text: string };
  }>(null);
  const { fontPx, lineHeight, setFontPx, setLineHeight } = useShelfReadingPrefs();
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageBySectionRef = useRef<Record<string, number>>({});

  const isLesson = section?.kind === 'lesson';
  const contentKey = `${bookId}:${sectionId}:${fontPx}:${lineHeight}`;

  const sections = book?.sections ?? [];
  const sectionIndex = useMemo(
    () => sections.findIndex((s) => s.id === sectionId),
    [sections, sectionId],
  );

  const canPrevSection = sectionIndex > 0;
  const canNextSection = sectionIndex >= 0 && sectionIndex < sections.length - 1;
  const canPrev = pageIndex > 0 || canPrevSection;
  const canNext = pageIndex < pageCount - 1 || canNextSection;

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

  useEffect(() => {
    setPageCount(1);
    setTextSelection(null);
    setMarkPaletteOpen(false);
    clearShelfTextSelection();
  }, [sectionId, contentKey]);

  useEffect(() => {
    setTextSelection(null);
    setMarkPaletteOpen(false);
    clearShelfTextSelection();
  }, [pageIndex]);

  useEffect(() => {
    const refresh = () => {
      setHighlightMap(getHighlightMap());
      setAnnotationRevision((n) => n + 1);
    };
    refresh();
    return subscribeLocalDataChanged(refresh);
  }, []);

  const bumpAnnotations = useCallback(() => {
    setHighlightMap(getHighlightMap());
    setAnnotationRevision((n) => n + 1);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let raf = 0;
    const onSelectionChange = () => {
      if (thoughtWrite || thoughtHub || tocOpen || fontOpen || shareOpen) return;
      cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const article = document.querySelector<HTMLElement>(
          '.shelf-turn-panel-active [data-shelf-prose="1"]',
        );
        if (!article) {
          setTextSelection(null);
          setSelectionRefStr('');
          return;
        }
        const sel = readShelfTextSelection(article);
        if (!sel) {
          setTextSelection(null);
          setSelectionRefStr('');
          setMarkPaletteOpen(false);
          return;
        }
        const sb = article.dataset.shelfBook || bookId;
        const ss = article.dataset.shelfSection || sectionId || '';
        const sp = Number(article.dataset.shelfPage ?? pageIndex);
        const ref = buildShelfMarkRef(sb, ss, sp, { start: sel.start, end: sel.end });
        setTextSelection(sel);
        setSelectionRefStr(ref);
      });
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [
    bookId,
    sectionId,
    pageIndex,
    thoughtWrite,
    thoughtHub,
    tocOpen,
    fontOpen,
    shareOpen,
  ]);

  const selectionMark = useMemo(() => {
    if (!selectionRefStr || !textSelection || !sectionId) return null;
    const ref = findShelfHighlightRef(
      bookId,
      sectionId,
      pageIndex,
      { start: textSelection.start, end: textSelection.end },
      highlightMap,
    );
    return ref ? highlightMap[ref]?.color ?? null : null;
  }, [selectionRefStr, textSelection, sectionId, bookId, pageIndex, highlightMap]);

  const selectionLabel = useMemo(() => {
    if (!sectionId) return '';
    return formatShelfMarkRefLabel(
      selectionRefStr || buildShelfMarkRef(bookId, sectionId, pageIndex),
      book?.title,
      section?.title,
    );
  }, [selectionRefStr, bookId, sectionId, pageIndex, book?.title, section?.title]);

  const focusBarStyle = useMemo(() => {
    if (!textSelection) return { display: 'none' } as React.CSSProperties;
    const rect = textSelection.rect;
    const barW = Math.min(window.innerWidth - 16, 320);
    const barH = markPaletteOpen && !selectionMark ? 96 : 52;
    const margin = 12;
    let top = rect.bottom + margin;
    if (top + barH > window.innerHeight - 24) {
      top = Math.max(8, rect.top - barH - margin);
    }
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - barW / 2),
      window.innerWidth - barW - 8,
    );
    return {
      position: 'fixed',
      top,
      left,
      width: barW,
      zIndex: 130,
    } as React.CSSProperties;
  }, [textSelection, markPaletteOpen, selectionMark]);

  const overlayOpen = tocOpen || fontOpen || shareOpen || Boolean(thoughtHub || thoughtWrite);
  const hasTextSelection = Boolean(textSelection && selectionRefStr);

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
      if (delta > 0) {
        if (pageIndex < pageCount - 1) {
          setPageIndex((i) => i + 1);
          return 'page';
        }
        if (canNextSection) return 'section';
        return 'none';
      }
      if (pageIndex > 0) {
        setPageIndex((i) => i - 1);
        return 'page';
      }
      if (canPrevSection) return 'section';
      return 'none';
    },
    [pageIndex, pageCount, canNextSection, canPrevSection],
  );

  const pageTurn = useShelfTurn({
    enabled: Boolean(section) && !overlayOpen && !hasTextSelection && !markPaletteOpen,
    canPrev,
    canNext,
    blocked: overlayOpen || hasTextSelection || markPaletteOpen,
    resolveTurn,
    onSectionChange: (delta) => {
      if (delta > 0) goNextSection();
      else goPrevSection();
    },
    onDragApproach: prefetchNeighbor,
  });

  const tocGroups = useMemo(
    () => buildShelfTocGroups(book?.toc, book?.book_type),
    [book?.toc, book?.book_type],
  );

  const showBottomBar =
    !chromeHidden && !tocOpen && !fontOpen && !shareOpen && !pdfFullscreen && !hasTextSelection;

  const onContentTap = useCallback(() => {
    if (hasTextSelection) {
      clearShelfTextSelection();
      setTextSelection(null);
      setMarkPaletteOpen(false);
      return;
    }
    setChromeHidden((v) => !v);
  }, [hasTextSelection]);

  const openThoughtWriteNew = useCallback(
    (ref: string, label: string, verseText?: string) => {
      setThoughtHub(null);
      setThoughtWrite({
        ref,
        label,
        verseText,
        mode: 'new',
      });
      clearShelfTextSelection();
      setTextSelection(null);
      setMarkPaletteOpen(false);
    },
    [],
  );

  const applyMarkChoice = useCallback(
    (color: HighlightColor) => {
      if (!selectionRefStr) return;
      pickShelfHighlight(
        selectionRefStr,
        color,
        highlightMap,
        (ref, c) => setHighlight(ref, c),
        removeHighlight,
      );
      bumpAnnotations();
      clearShelfTextSelection();
      setTextSelection(null);
      setMarkPaletteOpen(false);
    },
    [selectionRefStr, highlightMap, bumpAnnotations],
  );

  const clearMark = useCallback(() => {
    if (!selectionRefStr) return;
    removeHighlight(selectionRefStr);
    bumpAnnotations();
    clearShelfTextSelection();
    setTextSelection(null);
    setMarkPaletteOpen(false);
  }, [selectionRefStr, bumpAnnotations]);

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
          annotationRevision={interactive ? annotationRevision : 0}
          onPageCount={interactive ? setPageCount : undefined}
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
          bookId={interactive ? bookId : undefined}
          sectionId={interactive ? sec.id : undefined}
          annotationRevision={interactive ? annotationRevision : 0}
          onPageCount={interactive ? setPageCount : undefined}
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
  const prevPageIndex = 0;

  return (
    <main
      className={[
        'shelf-reader',
        chromeHidden ? 'shelf-reader-hidden' : '',
        isLesson ? 'shelf-reader-lesson' : '',
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
              {renderSectionContent(prevSection, prevPageIndex, false)}
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
                        onClick={() => goSection(sid, { page: 0 })}
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
      />

      {shareOpen && sectionId ? (
        <ShelfCheckinSheet
          bookId={bookId}
          bookTitle={book?.title || ''}
          sectionId={sectionId}
          sectionTitle={section?.title || ''}
          presetGroupId={presetGroupId}
          onClose={() => setShareOpen(false)}
          onDone={() => flashToast('已分享到共读群')}
        />
      ) : null}

      {hasTextSelection && !overlayOpen ? (
        <ShelfFocusBar
          style={focusBarStyle}
          markPaletteOpen={markPaletteOpen}
          currentMark={selectionMark}
          onNote={() =>
            openThoughtWriteNew(selectionRefStr, selectionLabel, textSelection?.text)
          }
          onToggleMark={() => {
            if (selectionMark) {
              clearMark();
              return;
            }
            setMarkPaletteOpen((v) => !v);
          }}
          onPickColor={applyMarkChoice}
          onCopy={() => {
            const text = `${selectionLabel} ${textSelection?.text ?? ''}`.trim();
            void navigator.clipboard.writeText(text).then(
              () => flashToast('已复制'),
              () => flashToast('已复制'),
            );
            clearShelfTextSelection();
            setTextSelection(null);
            setMarkPaletteOpen(false);
          }}
        />
      ) : null}

      {thoughtHub && !thoughtWrite ? (
        <ThoughtHubSheet
          refStr={thoughtHub.ref}
          refLabel={thoughtHub.label}
          verseText={thoughtHub.text}
          onChanged={bumpAnnotations}
          onClose={() => setThoughtHub(null)}
          onWriteNew={() =>
            openThoughtWriteNew(thoughtHub.ref, thoughtHub.label, thoughtHub.text)
          }
          onEdit={(t: ThoughtRow) => {
            setThoughtWrite({
              ref: thoughtHub.ref,
              label: thoughtHub.label,
              verseText: thoughtHub.text,
              mode: 'edit',
              thoughtId: t.id,
              initialBody: t.body,
              initialVisibility: t.visibility,
              returnHub: thoughtHub,
            });
          }}
        />
      ) : null}

      {thoughtWrite ? (
        <ThoughtWriteSheet
          refStr={thoughtWrite.ref}
          refLabel={thoughtWrite.label}
          verseText={thoughtWrite.verseText}
          mode={thoughtWrite.mode}
          initialBody={thoughtWrite.initialBody}
          initialVisibility={thoughtWrite.initialVisibility}
          onClose={() => {
            setThoughtWrite(null);
            if (thoughtWrite.returnHub) setThoughtHub(thoughtWrite.returnHub);
          }}
          onBack={
            thoughtWrite.returnHub
              ? () => {
                  setThoughtWrite(null);
                  setThoughtHub(thoughtWrite.returnHub ?? null);
                }
              : undefined
          }
          onSave={(body, visibility) => {
            if (thoughtWrite.mode === 'edit' && thoughtWrite.thoughtId) {
              updateThought(thoughtWrite.thoughtId, body, visibility);
            } else {
              addThought(thoughtWrite.ref, body, visibility);
            }
            bumpAnnotations();
            notifyLocalDataChanged('thoughts');
            setThoughtWrite(null);
            if (thoughtWrite.returnHub) setThoughtHub(thoughtWrite.returnHub);
            else flashToast('已保存想法');
          }}
        />
      ) : null}
    </main>
  );
}
