'use client';

import dynamic from 'next/dynamic';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
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
import { shelfReadingStyleVars } from '@/lib/shelf_reading';
import { buildShelfTocGroups, resolveSectionId, shelfTocDisplayTitle } from '@/lib/shelf_toc';
import { useReaderPageTurn } from '@/components/reader/useReaderPageTurn';
import '@/styles/shelf.css';

const ShelfLessonPanel = dynamic(() => import('@/components/shelf/ShelfLessonPanel'), {
  ssr: false,
  loading: () => <p className="muted shelf-pdf-status">加载教案…</p>,
});

type Props = {
  bookId: string;
  initialSectionId?: string | null;
};

const SectionPage = memo(function SectionPage({
  html,
  onTap,
}: {
  html: string;
  onTap?: () => void;
}) {
  return (
    <article
      className="shelf-turn-scroll shelf-prose"
      onClick={onTap}
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  );
});

export default function ShelfReader({ bookId, initialSectionId }: Props) {
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
  const [chromeHidden, setChromeHidden] = useState(false);
  const { fontPx, lineHeight, setFontPx, setLineHeight } = useShelfReadingPrefs();
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLesson = section?.kind === 'lesson';

  const sections = book?.sections ?? [];
  const sectionIndex = useMemo(
    () => sections.findIndex((s) => s.id === sectionId),
    [sections, sectionId],
  );

  const canPrevSection = sectionIndex > 0;
  const canNextSection = sectionIndex >= 0 && sectionIndex < sections.length - 1;

  useEffect(() => {
    document.body.classList.add('shelf-reader-active');
    return () => {
      document.body.classList.remove('shelf-reader-active');
    };
  }, []);

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
  }, [bookId, initialSectionId]);

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
    if (!sectionId) return;
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(() => {
      saveShelfProgress(bookId, sectionId, {
        bookTitle: book?.title,
        sectionTitle: section?.title,
      });
    }, 350);
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, [bookId, sectionId, book?.title, section?.title]);

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

  const goSection = useCallback((id: string | null) => {
    if (!id) return;
    setSectionId(id);
    setTocOpen(false);
    setChromeHidden(false);
  }, []);

  const goPrev = useCallback(() => {
    if (sectionIndex > 0) goSection(sections[sectionIndex - 1]?.id ?? null);
  }, [goSection, sectionIndex, sections]);

  const goNext = useCallback(() => {
    if (sectionIndex >= 0 && sectionIndex < sections.length - 1) {
      goSection(sections[sectionIndex + 1]?.id ?? null);
    }
  }, [goSection, sectionIndex, sections]);

  const pageTurn = useReaderPageTurn({
    enabled: !!section && (!isLesson ? !!section.html : true) && !tocOpen && !fontOpen,
    canPrev: canPrevSection,
    canNext: canNextSection,
    blocked: tocOpen || fontOpen,
    onChapterChange: (delta) => {
      if (delta < 0) goPrev();
      else goNext();
    },
    onDragApproach: prefetchNeighbor,
  });

  const tocGroups = useMemo(
    () => buildShelfTocGroups(book?.toc, book?.book_type),
    [book?.toc, book?.book_type],
  );

  const chromeVisible = !chromeHidden || isLesson;
  const showBottomBar = chromeVisible && !tocOpen && !fontOpen;

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
        chromeHidden && !isLesson ? 'shelf-reader-hidden' : '',
        isLesson ? 'shelf-reader-lesson' : '',
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

      {isLesson && section ? (
        <div
          className={`shelf-turn-viewport shelf-turn-viewport-lesson${pageTurn.turning ? ' is-turning' : ''}`}
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
            <div className="shelf-turn-panel shelf-turn-panel-peek" aria-hidden />
            <div className="shelf-turn-panel shelf-turn-panel-active">
              <div className="shelf-reader-body shelf-reader-body-lesson">
                <ShelfLessonPanel bookId={bookId} section={section} />
              </div>
            </div>
            <div className="shelf-turn-panel shelf-turn-panel-peek" aria-hidden />
          </div>
        </div>
      ) : section?.html ? (
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
              <SectionPage html={prevSection?.html ?? ''} />
            </div>
            <div className="shelf-turn-panel shelf-turn-panel-active">
              <SectionPage
                html={section.html}
                onTap={() => setChromeHidden((v) => !v)}
              />
            </div>
            <div className="shelf-turn-panel shelf-turn-panel-peek">
              <SectionPage html={nextSection?.html ?? ''} />
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
          <button
            type="button"
            className="shelf-reader-bottom-btn"
            aria-label="目录"
            onClick={() => setTocOpen(true)}
          >
            <span className="shelf-reader-bottom-icon" aria-hidden>
              ☰
            </span>
            <span>目录</span>
          </button>
          <button
            type="button"
            className="shelf-reader-bottom-btn"
            aria-label="字体设置"
            onClick={() => setFontOpen(true)}
          >
            <span className="shelf-reader-bottom-icon" aria-hidden>
              Aa
            </span>
            <span>字体</span>
          </button>
        </nav>
      ) : null}

      {tocOpen ? (
        <div
          className="shelf-toc-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="目录"
          onClick={() => setTocOpen(false)}
        >
          <div className="shelf-toc-panel" onClick={(e) => e.stopPropagation()}>
            <div className="shelf-toc-head">
              <strong>{book?.title}</strong>
              <button type="button" className="icon-btn" aria-label="关闭" onClick={() => setTocOpen(false)}>
                ✕
              </button>
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
                        onClick={() => goSection(sid)}
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
    </main>
  );
}
