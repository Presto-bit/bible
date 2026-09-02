'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getPlatformShelfBook,
  getPlatformShelfSection,
  loadShelfProgress,
  saveShelfProgress,
  type ShelfBookDetail,
  type ShelfSection,
  type ShelfTocItem,
} from '@/lib/shelf_api';
import ShelfLessonPanel from '@/components/shelf/ShelfLessonPanel';
import '@/styles/shelf.css';

type Props = {
  bookId: string;
  initialSectionId?: string | null;
};

function tocGroups(toc: ShelfBookDetail['toc']) {
  return [
    { key: 'front', label: '文前', items: toc.front ?? [] },
    { key: 'outline', label: '目录', items: toc.outline ?? [] },
    { key: 'body', label: '正文', items: toc.body ?? [] },
    { key: 'appendix', label: '附录', items: toc.appendix ?? [] },
  ].filter((g) => g.items.length > 0);
}

function resolveSectionId(item: ShelfTocItem, sections: { id: string; title: string }[]) {
  if (item.section_id) return item.section_id;
  const hit = sections.find((s) => s.title === item.title);
  return hit?.id ?? null;
}

export default function ShelfReader({ bookId, initialSectionId }: Props) {
  const [book, setBook] = useState<ShelfBookDetail | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(initialSectionId ?? null);
  const [section, setSection] = useState<ShelfSection | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);

  const isLesson = section?.kind === 'lesson';

  const sections = book?.sections ?? [];
  const sectionIndex = useMemo(
    () => sections.findIndex((s) => s.id === sectionId),
    [sections, sectionId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    getPlatformShelfBook(bookId)
      .then((detail) => {
        if (cancelled) return;
        setBook(detail);
        const saved = loadShelfProgress(bookId);
        const first = detail.sections?.[0]?.id ?? null;
        const pick = initialSectionId || saved || first;
        const isCollection = detail.book_type === 'collection';
        if (isCollection && !initialSectionId && !saved) {
          setSectionId(null);
          setTocOpen(true);
          return;
        }
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
    setSection(null);
    getPlatformShelfSection(bookId, sectionId)
      .then((s) => {
        if (cancelled) return;
        setSection(s);
        saveShelfProgress(bookId, sectionId);
      })
      .catch(() => {
        if (!cancelled) setErr('无法加载章节');
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, sectionId]);

  const goSection = useCallback((id: string | null) => {
    if (!id) return;
    setSectionId(id);
    setTocOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goPrev = () => {
    if (sectionIndex > 0) goSection(sections[sectionIndex - 1]?.id ?? null);
  };

  const goNext = () => {
    if (sectionIndex >= 0 && sectionIndex < sections.length - 1) {
      goSection(sections[sectionIndex + 1]?.id ?? null);
    }
  };

  if (loading && !book) {
    return (
      <main className="shelf-reader">
        <div className="shelf-reader-top">
          <Link href="/shelf" className="nav-back nav-back-page" aria-label="返回书架">
            ‹
          </Link>
          <h1>加载中…</h1>
        </div>
      </main>
    );
  }

  if (err && !book) {
    return (
      <main className="shelf-reader">
        <div className="shelf-reader-top">
          <Link href="/shelf" className="nav-back nav-back-page" aria-label="返回书架">
            ‹
          </Link>
          <h1>{err}</h1>
        </div>
      </main>
    );
  }

  const title = section?.title || (tocOpen && !sectionId ? book?.title : '') || book?.title || '阅读';

  return (
    <main className={`shelf-reader${chromeHidden && !isLesson ? ' shelf-reader-hidden' : ''}${isLesson ? ' shelf-reader-lesson' : ''}`}>
      <header className="shelf-reader-top">
        <Link href="/shelf" className="nav-back nav-back-page" aria-label="返回书架">
          ‹
        </Link>
        <h1>{title}</h1>
        <button
          type="button"
          className="icon-btn"
          aria-label="目录"
          onClick={() => setTocOpen(true)}
        >
          ☰
        </button>
      </header>

      {isLesson && section ? (
        <div className="shelf-reader-body shelf-reader-body-lesson">
          <ShelfLessonPanel bookId={bookId} section={section} />
        </div>
      ) : section ? (
        <article
          className="shelf-reader-body"
          onClick={() => setChromeHidden((v) => !v)}
          dangerouslySetInnerHTML={{ __html: section.html || '' }}
        />
      ) : (
        <div className="shelf-reader-body shelf-reader-body-pick">
          <p className="muted">请从目录选择一课</p>
        </div>
      )}

      <nav className="shelf-reader-nav" aria-label="章节导航">
        <button type="button" onClick={goPrev} disabled={sectionIndex <= 0}>
          上一节
        </button>
        <button type="button" onClick={() => setTocOpen(true)}>
          目录
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={sectionIndex < 0 || sectionIndex >= sections.length - 1}
        >
          下一节
        </button>
      </nav>

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
              {tocGroups(book?.toc ?? {}).map((group) => (
                <div key={group.key}>
                  <div className="shelf-toc-group">{group.label}</div>
                  {group.items.map((item) => {
                    if (item.level === 1 && !item.section_id) {
                      return (
                        <div key={item.id} className="shelf-toc-unit">
                          {item.title}
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
                        {item.title}
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
    </main>
  );
}
