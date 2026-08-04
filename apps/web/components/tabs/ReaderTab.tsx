'use client';

import dynamic from 'next/dynamic';
import '@/styles/reader.css';
import '@/styles/reader_catalog.css';
import '@/styles/plans.css';
import '@/styles/group_chat.css';
import '@/styles/assistant.css';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type BibleBook, type DictEntity } from '@/lib/api';
import { bibleBooks } from '@/lib/bible_client';
import { seededBooks } from '@/lib/bible_local';
import { getLastRead, setLastRead } from '@/lib/reading';
import { hydratePlanFromUrl, type PlanReadingMeta } from '@/lib/plan_reading';
import { clearReaderChrome } from '@/lib/reader_chrome';
import { parseMarkRef } from '@/lib/mark_ref';
import { parseFeedHintFromSearchParams, type FeedActivityHint } from '@/lib/feed_activity';
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
import { refSpaceToOsis } from '@/lib/inline_ref';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { preloadSectionTitles } from '@/lib/section_titles';
import { OfflineBibleCard } from '@/components/OfflineBibleCard';
import { OfflineInlineNotice } from '@/components/OfflineInlineNotice';
import { bookAbbr } from '@/lib/book_abbr';
import { useOnline } from '@/lib/use_online';
import { shellTapProps } from '@/lib/shell_tap';
import CatalogView from '@/components/reader/CatalogView';
import ReaderView from '@/components/reader/ReaderView';
import { EntityKnowledgeSheet } from '@/components/knowledge/EntityKnowledgeSheet';

/** Sheet 仍动态加载；目录/阅读器、词典弹层静态导入，避免慢网/WebView 下 chunk 不到位时点了没反应 */
const VersePreviewSheet = dynamic(
  () => import('@/components/reader/VersePreviewSheet').then((m) => m.VersePreviewSheet),
  { ssr: false },
);

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
  const [books, setBooks] = useState<BibleBook[]>(() => {
    try {
      return seededBooks();
    } catch {
      return [];
    }
  });
  const [book, setBook] = useState<BibleBook | null>(null);
  const [chapter, setChapter] = useState(1);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [booksLoading, setBooksLoading] = useState(false);
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
  const [flashNonce, setFlashNonce] = useState(0);
  const [feedHint, setFeedHint] = useState<FeedActivityHint | null>(null);
  const booksLenRef = useRef(0);
  const errRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);
  booksLenRef.current = books.length;
  errRef.current = err;

  const loadBooks = useCallback((silent = false) => {
    if (silent && booksLenRef.current > 0) return;
    const seq = ++loadSeqRef.current;
    if (!silent) setBooksLoading(true);
    bibleBooks()
      .then((bookList) => {
        if (seq !== loadSeqRef.current) return;
        setBooks(bookList);
        setErr(null);
      })
      .catch((e) => {
        if (seq !== loadSeqRef.current) return;
        if (!silent) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (seq !== loadSeqRef.current) return;
        if (!silent) setBooksLoading(false);
      });
  }, []);

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
    // 立刻挂 sheet，不等整页经文重绘队列
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
              role="button"
              tabIndex={0}
              title={candidates.length > 1 ? '点击查看（可能有多义）' : '查看词典'}
              {...shellTapProps({
                preventDefault: true,
                softRecover: true,
                onTap: () => handleNameClick(part, verse),
              })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleNameClick(part, verse);
                }
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
        const nextCh = Math.min(Math.max(1, ch), b.chapter_count);
        setBook(b);
        setChapter(nextCh);
        setLastRead(b.id, nextCh);
      }
    },
    [books],
  );

  const inScriptureReading = Boolean(book && !catalogOpen);

  useEffect(() => {
    if (!inScriptureReading) {
      clearReaderChrome();
      // 离开章节时同步恢复 theme-color（目录/选书与 iOS 主屏幕一致）
      void import('@/lib/app_theme').then((m) => m.applyAppTheme());
    }
  }, [inScriptureReading]);

  useEffect(() => {
    if (paneActive) return;
    setDictPopup(null);
    setDictRefPreview(null);
  }, [paneActive]);

  useEffect(() => {
    if (!paneActive || !book) return;
    const openedAt = Date.now();
    const bookId = book.id;
    const ch = chapter;
    void import('@/lib/product_events').then((m) =>
      m.trackProductEvent('reader_open', {
        props: { book: bookId, chapter: ch },
        oncePerDay: true,
        onceSalt: bookId,
      }),
    );
    return () => {
      const sec = Math.max(1, Math.round((Date.now() - openedAt) / 1000));
      void import('@/lib/product_events').then((m) =>
        m.trackProductEvent('reader_session_end', {
          props: { book: bookId, chapter: ch, duration_sec: sec },
        }),
      );
    };
    // 按书卷维度计会话；换章不重置，避免刷 session_end
  }, [paneActive, book?.id]);

  useEffect(() => {
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    if (paneActive) {
      // 已有 seed 时静默刷新；无目录才显示 loading
      loadBooks(booksLenRef.current > 0);
    } else if (typeof navigator !== 'undefined' && navigator.onLine) {
      const run = () => loadBooks(true);
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(run, { timeout: 8000 });
      } else {
        timeoutId = window.setTimeout(run, 2000);
      }
    }

    const onPackReady = () => {
      if (booksLenRef.current === 0 || errRef.current) loadBooks(false);
    };
    const onOnline = () => {
      if (booksLenRef.current === 0 || errRef.current) loadBooks(!paneActive);
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
  }, [paneActive, loadBooks]);

  // 词典尽早预热：进入圣经 Tab 即拉（不限已进章节），避免「点了没下划线 / 像卡死」
  useEffect(() => {
    if (!paneActive) return;
    if (dict.length > 0) return;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    const run = () => {
      void api.dictionary().then((d) => {
        // 词典回填重绘整章：低优先级，避免挡设置/翻页
        startTransition(() => {
          setDict(d.entities || []);
        });
      }).catch(() => {});
    };
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(run, 200);
    }
    return () => {
      if (idleId != null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [paneActive, dict.length]);

  // 大纲：等进入经文阅读后再拉，避免与目录/首章抢带宽
  useEffect(() => {
    if (!paneActive || !book || catalogOpen) return;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    const run = () => {
      preloadSectionTitles();
      if (dict.length === 0) {
        void api.dictionary().then((d) => {
          startTransition(() => setDict(d.entities || []));
        }).catch(() => {});
      }
    };
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout: 1800 });
    } else {
      timeoutId = window.setTimeout(run, 300);
    }
    return () => {
      if (idleId != null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [paneActive, book, catalogOpen, dict.length]);

  const bookRef = useRef(book);
  bookRef.current = book;

  useEffect(() => {
    if (!books.length) return;
    let cancelled = false;
    const refParam = searchParams.get('ref');
    const flashParam = searchParams.get('flash');
    const verseParam = searchParams.get('verse');
    const parsedRef = refParam ? parseMarkRef(refParam) : null;
    const parsedFlash = flashParam ? parseMarkRef(flashParam) : null;
    const bookId =
      searchParams.get('book') ||
      parsedRef?.bookId ||
      parsedFlash?.bookId ||
      null;
    const planId = searchParams.get('plan');
    const hasUrlNav = Boolean(bookId || planId || flashParam || refParam || verseParam);

    const clearReaderNavQuery = () => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of ['book', 'chapter', 'ref', 'flash', 'verse', 'group']) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (!changed) return;
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    };

    const apply = async () => {
      const chapterFromUrl =
        searchParams.get('chapter') ||
        (parsedRef ? String(parsedRef.chapter) : null) ||
        (parsedFlash ? String(parsedFlash.chapter) : null) ||
        '1';
      const verseFromUrl = Number(
        verseParam ||
          (parsedFlash?.verseStart != null ? String(parsedFlash.verseStart) : '') ||
          (parsedRef?.verseStart != null ? String(parsedRef.verseStart) : ''),
      );
      const synthesizedFlash =
        flashParam ||
        refParam ||
        (bookId && Number.isFinite(verseFromUrl) && verseFromUrl >= 1
          ? `${bookId.toUpperCase()}.${chapterFromUrl}.${Math.floor(verseFromUrl)}`
          : null);

      // 仅在有导航参数时更新 flash；清 query 后的空 URL 不要冲掉待滚动的 flashRef
      if (hasUrlNav) {
        if (synthesizedFlash) {
          setFlashRef(synthesizedFlash);
          setFlashNonce((n) => n + 1);
        } else {
          setFlashRef(null);
        }
      }

      setFeedHint(parseFeedHintFromSearchParams(searchParams));

      const groupParam = searchParams.get('group');
      if (groupParam) setCheckinGroupId(groupParam);

      if (planId) {
        const planDay = Number(searchParams.get('day') || '1');
        const meta = await hydratePlanFromUrl(planId, planDay);
        if (cancelled) return;
        if (meta) {
          setPlanMeta(meta);
          const step = meta.steps[meta.session.currentStepIndex] ?? meta.steps[0];
          const ch = Number(chapterFromUrl);
          const b = books.find((x) => x.id === (bookId?.toUpperCase() ?? step.bookId));
          if (b) {
            const nextCh = Math.min(Math.max(1, bookId ? ch : step.chapterStart), b.chapter_count);
            setBook(b);
            setChapter(nextCh);
            setLastRead(b.id, nextCh);
          }
          return;
        }
      }

      if (bookId) {
        const ch = Number(chapterFromUrl);
        const b = books.find((x) => x.id === bookId.toUpperCase());
        if (b) {
          const nextCh = Math.min(Math.max(1, ch), b.chapter_count);
          setBook(b);
          setChapter(nextCh);
          setLastRead(b.id, nextCh);
          clearReaderNavQuery();
        }
        return;
      }

      if (!hasUrlNav && !bookRef.current) {
        const last = getLastRead();
        if (last) {
          const b = books.find((x) => x.id === last.bookId.toUpperCase());
          if (b) {
            const ch = Math.min(Math.max(1, last.chapter), b.chapter_count);
            setBook(b);
            setChapter(ch);
            void import('@/lib/chapter_prefetch').then((m) => {
              void m.loadChapterVerses(b.id, ch, null);
            });
          }
        }
      }
    };
    void apply();
    return () => {
      cancelled = true;
    };
  }, [books, searchParams]);

  const handleNavigate = useCallback((b: BibleBook, ch: number) => {
    const nextCh = Math.min(Math.max(1, ch), b.chapter_count);
    setBook(b);
    setChapter(nextCh);
    setLastRead(b.id, nextCh);
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
    const last = typeof window !== 'undefined' ? getLastRead() : null;
    return (
      <main className="container">
        <p className="muted">
          {last ? '正在打开上次阅读…' : '加载经卷目录…'}
        </p>
      </main>
    );
  }

  if (err && !books.length) {
    return (
      <main className="container reader-offline-shell">
        <OfflineInlineNotice
          title={!online ? '当前离线' : '加载失败'}
          detail={err}
          action={{ label: '重试', onClick: () => loadBooks(false) }}
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
        flashNonce={flashNonce}
        feedHint={feedHint}
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
