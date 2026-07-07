'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type BibleBook, type DictEntity } from '@/lib/api';
import { bibleBooks } from '@/lib/bible_client';
import CatalogView from '@/components/reader/CatalogView';
import ReaderView from '@/components/reader/ReaderView';
import { getLastRead } from '@/lib/reading';
import { hydratePlanFromUrl, type PlanReadingMeta } from '@/lib/plan_reading';
import { clearReaderChrome } from '@/lib/reader_chrome';
import { parseMarkRef } from '@/lib/mark_ref';
import {
  buildDictIndex,
  dictMatchPattern,
  hasAlternateSenses,
  lookupDictCandidates,
  properNounClass,
  writeDictChoice,
  type DictContext,
} from '@/lib/dictionary_match';
import { recordDictEntity } from '@/lib/badge_events';
import { EntityKnowledgeSheet } from '@/components/knowledge/EntityKnowledgeSheet';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { preloadSectionTitles } from '@/lib/section_titles';
import { OfflineBibleCard } from '@/components/OfflineBibleCard';
import { OfflineInlineNotice } from '@/components/OfflineInlineNotice';
import { bookAbbr } from '@/lib/book_abbr';
import { useOnline } from '@/lib/use_online';

type ReaderTabProps = {
  /** PWA 保活：非当前 Tab 时为 false，用于收起阅读器壳层样式 */
  paneActive?: boolean;
};

export default function ReaderTab({ paneActive = true }: ReaderTabProps) {
  return (
    <Suspense fallback={(
      <main className="container">
        <p className="muted">加载中…</p>
      </main>
    )}>
      <ReaderTabInner paneActive={paneActive} />
    </Suspense>
  );
}

function ReaderTabInner({ paneActive }: { paneActive: boolean }) {
  const searchParams = useSearchParams();
  const online = useOnline();
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [book, setBook] = useState<BibleBook | null>(null);
  const [chapter, setChapter] = useState(1);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [booksLoading, setBooksLoading] = useState(true);
  const [dict, setDict] = useState<DictEntity[]>([]);
  const [dictPopup, setDictPopup] = useState<{
    entity: DictEntity;
    name: string;
    candidates: DictEntity[];
    ctx: DictContext;
  } | null>(null);
  const [dictRefPreview, setDictRefPreview] = useState<{ osis: string; label: string } | null>(null);
  const [planMeta, setPlanMeta] = useState<PlanReadingMeta | null>(null);
  const [checkinGroupId, setCheckinGroupId] = useState<string | null>(null);
  const [flashRef, setFlashRef] = useState<string | null>(null);
  const booksLenRef = useRef(0);
  booksLenRef.current = books.length;

  const dictIndex = useMemo(() => buildDictIndex(dict), [dict]);
  const properNounRe = useMemo(() => dictMatchPattern(dictIndex), [dictIndex]);

  const openEntity = useCallback((
    entity: DictEntity,
    name: string,
    ctx: DictContext,
    candidates: DictEntity[],
    remember: boolean,
  ) => {
    if (remember) writeDictChoice(name, ctx.bookId, entity.id ?? entity.name, ctx.chapter);
    recordDictEntity(entity.id ?? entity.name);
    setDictPopup({ entity, name, candidates, ctx });
  }, []);

  const handleNameClick = useCallback(
    (name: string, verse: number) => {
      if (!book) return;
      const ctx: DictContext = { bookId: book.id, chapter, verse };
      const candidates = lookupDictCandidates(name, dictIndex, ctx);
      if (!candidates.length) return;
      // 直接展示语境最佳义项，避免「先选再看」造成困惑
      openEntity(candidates[0], name, ctx, candidates, candidates.length === 1);
    },
    [book, chapter, dictIndex, openEntity],
  );

  const renderVerseText = useCallback(
    (text: string, keyBase: string, verse: number) => {
      if (!properNounRe) return text;
      const parts = text.split(properNounRe);
      return parts.map((part, i) => {
        const candidates = dictIndex.get(part);
        if (candidates?.length) {
          const picked = candidates[0];
          return (
            <span
              key={`${keyBase}-pn${i}`}
              className={properNounClass(picked)}
              title={candidates.length > 1 ? '点击查看（可能有多义）' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                handleNameClick(part, verse);
              }}
            >
              {part}
            </span>
          );
        }
        return <span key={`${keyBase}-t${i}`}>{part}</span>;
      });
    },
    [properNounRe, dictIndex, handleNameClick],
  );

  const handleNodeClick = useCallback(
    (entityId: string) => {
      const ent = dict.find((e) => (e.id ?? e.name) === entityId);
      if (!ent || !dictPopup) return;
      openEntity(ent, dictPopup.name, dictPopup.ctx, dictPopup.candidates, true);
    },
    [dict, dictPopup, openEntity],
  );

  const handlePlanJump = useCallback(
    (bookId: string, ch: number) => {
      const b = books.find((x) => x.id === bookId.toUpperCase());
      if (b) {
        setBook(b);
        setChapter(Math.min(Math.max(1, ch), b.chapter_count));
      }
    },
    [books],
  );

  const inScriptureReading = Boolean(book && !catalogOpen);

  useEffect(() => {
    if (!inScriptureReading) clearReaderChrome();
  }, [inScriptureReading]);

  useEffect(() => {
    preloadSectionTitles();
    api.dictionary().then((d) => setDict(d.entities || [])).catch(() => setDict([]));

    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const loadBooks = (silent = false) => {
      if (silent && booksLenRef.current > 0) return;
      if (!silent) setBooksLoading(true);
      bibleBooks()
        .then((bookList) => {
          setBooks(bookList);
          setErr(null);
        })
        .catch((e) => {
          if (!silent) setErr(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (!silent) setBooksLoading(false);
        });
    };

    if (paneActive) {
      if (booksLenRef.current === 0) loadBooks(false);
    } else if (typeof navigator !== 'undefined' && navigator.onLine) {
      const run = () => loadBooks(true);
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(run, { timeout: 8000 });
      } else {
        timeoutId = window.setTimeout(run, 2000);
      }
    }

    const onPackReady = () => {
      if (booksLenRef.current === 0) loadBooks(false);
    };
    const onOnline = () => {
      if (booksLenRef.current === 0) loadBooks(!paneActive);
    };
    window.addEventListener('presto-offline-pack-ready', onPackReady);
    window.addEventListener('online', onOnline);
    return () => {
      if (idleId != null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) window.clearTimeout(timeoutId);
      window.removeEventListener('presto-offline-pack-ready', onPackReady);
      window.removeEventListener('online', onOnline);
    };
  }, [paneActive]);

  useEffect(() => {
    if (!books.length) return;
    let cancelled = false;
    const refParam = searchParams.get('ref');
    const flashParam = searchParams.get('flash');
    const parsedRef = refParam ? parseMarkRef(refParam) : null;
    const bookId =
      searchParams.get('book') ||
      parsedRef?.bookId ||
      null;
    const planId = searchParams.get('plan');
    const hasUrlNav = Boolean(bookId || planId || flashParam || refParam);

    const apply = async () => {
      if (flashParam) setFlashRef(flashParam);
      else if (refParam) setFlashRef(refParam);

      const groupParam = searchParams.get('group');
      if (groupParam) setCheckinGroupId(groupParam);

      if (planId) {
        const planDay = Number(searchParams.get('day') || '1');
        const meta = await hydratePlanFromUrl(planId, planDay);
        if (cancelled) return;
        if (meta) {
          setPlanMeta(meta);
          const step = meta.steps[meta.session.currentStepIndex] ?? meta.steps[0];
          const ch = Number(
            searchParams.get('chapter') ||
              (parsedRef ? String(parsedRef.chapter) : '1'),
          );
          const b = books.find((x) => x.id === (bookId?.toUpperCase() ?? step.bookId));
          if (b) {
            setBook(b);
            setChapter(Math.min(Math.max(1, bookId ? ch : step.chapterStart), b.chapter_count));
          }
          return;
        }
      }

      if (bookId) {
        const ch = Number(
          searchParams.get('chapter') ||
            (parsedRef ? String(parsedRef.chapter) : '1'),
        );
        const b = books.find((x) => x.id === bookId.toUpperCase());
        if (b) {
          setBook(b);
          setChapter(Math.min(Math.max(1, ch), b.chapter_count));
        }
        return;
      }

      if (!hasUrlNav && !book) {
        const last = getLastRead();
        if (last) {
          const b = books.find((x) => x.id === last.bookId.toUpperCase());
          if (b) {
            setBook(b);
            setChapter(Math.min(Math.max(1, last.chapter), b.chapter_count));
          }
        }
      }
    };
    void apply();
    return () => {
      cancelled = true;
    };
  }, [books, searchParams, book]);

  const handleNavigate = useCallback((b: BibleBook, ch: number) => {
    setBook(b);
    setChapter(Math.min(Math.max(1, ch), b.chapter_count));
  }, []);

  const handlePlanExit = useCallback(() => {
    setPlanMeta(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('plan');
      url.searchParams.delete('day');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const handlePickChapter = useCallback((b: BibleBook, ch: number) => {
    handleNavigate(b, ch);
    setCatalogOpen(false);
  }, [handleNavigate]);

  if (booksLoading && !books.length && !err) {
    return (
      <main className="container">
        <p className="muted">加载经卷目录…</p>
      </main>
    );
  }

  if (err && !books.length) {
    return (
      <main className="container reader-offline-shell">
        <OfflineInlineNotice
          title={!online ? '当前离线' : '加载失败'}
          detail={err}
          action={{ label: '重试', onClick: () => {
            setErr(null);
            bibleBooks()
              .then((bookList) => { setBooks(bookList); setErr(null); })
              .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
              .finally(() => setBooksLoading(false));
          } }}
        >
          {!online ? <OfflineBibleCard /> : null}
        </OfflineInlineNotice>
      </main>
    );
  }

  if (catalogOpen && book) {
    return (
      <>
        {err ? (
          <main className="container reader-offline-shell">
            <OfflineInlineNotice title="提示" detail={err} />
          </main>
        ) : null}
        <CatalogView
          books={books}
          currentBookId={book.id}
          currentChapter={chapter}
          showBack
          onBack={() => setCatalogOpen(false)}
          onPickChapter={handlePickChapter}
          bookAbbr={bookAbbr}
          planSteps={planMeta?.steps}
        />
      </>
    );
  }

  if (!book) {
    return (
      <main className="container reader-offline-shell">
        {err ? (
          <OfflineInlineNotice title={!online ? '离线读经' : '提示'} detail={err}>
            {!online ? <OfflineBibleCard /> : null}
          </OfflineInlineNotice>
        ) : null}
        <CatalogView
          books={books}
          showBack={false}
          onPickChapter={handlePickChapter}
          bookAbbr={bookAbbr}
        />
      </main>
    );
  }

  return (
    <>
      {err ? (
        <div className="container reader-offline-shell">
          <OfflineInlineNotice title={!online ? '离线读经' : '提示'} detail={err} />
        </div>
      ) : null}
      <ReaderView
        book={book}
        books={books}
        chapter={chapter}
        onNavigate={handleNavigate}
        bookAbbr={bookAbbr}
        renderVerseText={renderVerseText}
        planMeta={planMeta}
        onPlanMetaChange={setPlanMeta}
        onPlanJump={handlePlanJump}
        onPlanExit={planMeta ? handlePlanExit : undefined}
        externalOverlayOpen={Boolean(dictPopup)}
        flashRef={flashRef}
        checkinGroupId={checkinGroupId}
        paneActive={paneActive}
      />
      {dictPopup && (
        <EntityKnowledgeSheet
          entity={dictPopup.entity}
          name={dictPopup.name}
          candidates={dictPopup.candidates}
          ctx={dictPopup.ctx}
          onClose={() => setDictPopup(null)}
          onPickEntity={(e, remember) => openEntity(e, dictPopup.name, dictPopup.ctx, dictPopup.candidates, remember)}
          onRefPreview={(osis, label) => setDictRefPreview({ osis, label })}
          onNodeClick={handleNodeClick}
        />
      )}
      {dictRefPreview && (
        <VersePreviewSheet
          refParam={dictRefPreview.osis}
          refLabel={dictRefPreview.label}
          onClose={() => setDictRefPreview(null)}
        />
      )}
    </>
  );
}
