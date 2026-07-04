'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  entityDisplayName,
  entitySummaryText,
  entityTypeLabel,
  lookupDictCandidates,
  needsDisambiguation,
  writeDictChoice,
  type DictContext,
} from '@/lib/dictionary_match';
import { DictDisambigSheet } from '@/components/dictionary/DictDisambigSheet';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { preloadSectionTitles } from '@/lib/section_titles';

const BOOK_ABBR: Record<string, string> = {
  创世记: '创', 出埃及记: '出', 利未记: '利', 民数记: '民', 申命记: '申',
  约书亚记: '书', 士师记: '士', 路得记: '得', 撒母耳记上: '撒上', 撒母耳记下: '撒下',
  列王纪上: '王上', 列王纪下: '王下', 历代志上: '代上', 历代志下: '代下', 以斯拉记: '拉',
  尼希米记: '尼', 以斯帖记: '斯', 约伯记: '伯', 诗篇: '诗', 箴言: '箴', 传道书: '传', 雅歌: '歌',
  以赛亚书: '赛', 耶利米书: '耶', 耶利米哀歌: '哀', 以西结书: '结', 但以理书: '但',
  何西阿书: '何', 约珥书: '珥', 阿摩司书: '摩', 俄巴底亚书: '俄', 约拿书: '拿', 弥迦书: '弥',
  那鸿书: '鸿', 哈巴谷书: '哈', 西番雅书: '番', 哈该书: '该', 撒迦利亚书: '亚', 玛拉基书: '玛',
  马太福音: '太', 马可福音: '可', 路加福音: '路', 约翰福音: '约', 使徒行传: '徒',
  罗马书: '罗', 哥林多前书: '林前', 哥林多后书: '林后', 加拉太书: '加', 以弗所书: '弗',
  腓立比书: '腓', 歌罗西书: '西', 帖撒罗尼迦前书: '帖前', 帖撒罗尼迦后书: '帖后',
  提摩太前书: '提前', 提摩太后书: '提后', 提多书: '多', 腓利门书: '门', 希伯来书: '来',
  雅各书: '雅', 彼得前书: '彼前', 彼得后书: '彼后', 约翰一书: '约一', 约翰二书: '约二',
  约翰三书: '约三', 犹大书: '犹', 启示录: '启',
};
const bookAbbr = (name: string) => BOOK_ABBR[name] ?? name.slice(0, 1);

export default function ReaderPage() {
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [book, setBook] = useState<BibleBook | null>(null);
  const [chapter, setChapter] = useState(1);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dict, setDict] = useState<DictEntity[]>([]);
  const [dictPopup, setDictPopup] = useState<DictEntity | null>(null);
  const [dictRefPreview, setDictRefPreview] = useState<{ osis: string; label: string } | null>(null);
  const [disambig, setDisambig] = useState<{ name: string; candidates: DictEntity[]; verse: number } | null>(null);
  const [planMeta, setPlanMeta] = useState<PlanReadingMeta | null>(null);
  const [checkinGroupId, setCheckinGroupId] = useState<string | null>(null);
  const [flashRef, setFlashRef] = useState<string | null>(null);

  const dictIndex = useMemo(() => buildDictIndex(dict), [dict]);
  const properNounRe = useMemo(() => dictMatchPattern(dictIndex), [dictIndex]);

  const openEntity = useCallback((entity: DictEntity, name: string, ctx: DictContext) => {
    writeDictChoice(name, ctx.bookId, entity.id ?? entity.name);
    setDictPopup(entity);
    setDisambig(null);
  }, []);

  const handleNameClick = useCallback(
    (name: string, verse: number) => {
      if (!book) return;
      const ctx: DictContext = { bookId: book.id, chapter, verse };
      const candidates = lookupDictCandidates(name, dictIndex, ctx);
      if (!candidates.length) return;
      if (candidates.length === 1 || !needsDisambiguation(candidates, ctx)) {
        openEntity(candidates[0], name, ctx);
        return;
      }
      setDisambig({ name, candidates, verse });
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
          return (
            <span
              key={`${keyBase}-pn${i}`}
              className="proper-noun"
              title={candidates.length > 1 ? '点击查看释义（可能有多义）' : undefined}
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
    bibleBooks()
      .then(async (bookList) => {
        const d = { books: bookList };
        setBooks(d.books);
        const params = new URLSearchParams(window.location.search);
        const refParam = params.get('ref');
        const flashParam = params.get('flash');
        if (flashParam) setFlashRef(flashParam);
        else if (refParam) setFlashRef(refParam);

        const parsedRef = refParam ? parseMarkRef(refParam) : null;
        const bookId =
          params.get('book') ||
          parsedRef?.bookId ||
          null;
        const ch = Number(
          params.get('chapter') ||
            (parsedRef ? String(parsedRef.chapter) : '1'),
        );
        const planId = params.get('plan');
        const planDay = Number(params.get('day') || '1');
        const groupParam = params.get('group');
        if (groupParam) setCheckinGroupId(groupParam);

        if (planId) {
          const meta = await hydratePlanFromUrl(planId, planDay);
          if (meta) {
            setPlanMeta(meta);
            const step = meta.steps[meta.session.currentStepIndex] ?? meta.steps[0];
            const b = d.books.find((x) => x.id === (bookId?.toUpperCase() ?? step.bookId));
            if (b) {
              setBook(b);
              setChapter(Math.min(Math.max(1, bookId ? ch : step.chapterStart), b.chapter_count));
              return;
            }
          }
        }

        if (bookId) {
          const b = d.books.find((x) => x.id === bookId.toUpperCase());
          if (b) {
            setBook(b);
            setChapter(Math.min(Math.max(1, ch), b.chapter_count));
          }
          return;
        }
        const last = getLastRead();
        if (last) {
          const b = d.books.find((x) => x.id === last.bookId.toUpperCase());
          if (b) {
            setBook(b);
            setChapter(Math.min(Math.max(1, last.chapter), b.chapter_count));
          }
        }
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) {
    return (
      <main className="container">
        <p className="muted">加载失败：{err}</p>
      </main>
    );
  }

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

  if (catalogOpen && book) {
    return (
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
    );
  }

  if (!book) {
    return (
      <CatalogView
        books={books}
        showBack={false}
        onPickChapter={handlePickChapter}
        bookAbbr={bookAbbr}
      />
    );
  }

  return (
    <>
      <ReaderView
        book={book}
        books={books}
        chapter={chapter}
        onNavigate={handleNavigate}
        onPickBook={() => setCatalogOpen(true)}
        bookAbbr={bookAbbr}
        renderVerseText={renderVerseText}
        planMeta={planMeta}
        onPlanMetaChange={setPlanMeta}
        onPlanJump={handlePlanJump}
        onPlanExit={planMeta ? handlePlanExit : undefined}
        externalOverlayOpen={Boolean(dictPopup || disambig)}
        flashRef={flashRef}
        checkinGroupId={checkinGroupId}
      />
      {disambig && book && (
        <DictDisambigSheet
          name={disambig.name}
          candidates={disambig.candidates}
          onPick={(e) => openEntity(e, disambig.name, { bookId: book.id, chapter, verse: disambig.verse })}
          onClose={() => setDisambig(null)}
        />
      )}
      {dictPopup && (
        <div className="sheet-backdrop" onClick={() => setDictPopup(null)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <h3 style={{ margin: 0 }}>
                {entityDisplayName(dictPopup)}
                {entityTypeLabel(dictPopup.type) ? (
                  <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                    {entityTypeLabel(dictPopup.type)}
                  </span>
                ) : null}
              </h3>
              <button type="button" className="text-link" onClick={() => setDictPopup(null)}>关闭</button>
            </div>
            <p style={{ lineHeight: 1.7, marginTop: 8 }}>{entitySummaryText(dictPopup)}</p>
            {dictPopup.refs?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>参考经文</p>
                <div className="share-actions">
                  {dictPopup.refs.slice(0, 8).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="font-pill"
                      onClick={() => setDictRefPreview({
                        osis: r.includes('.') ? r : refSpaceToOsis(r),
                        label: formatGroupRefLabel(r) ?? r,
                      })}
                    >
                      {formatGroupRefLabel(r) ?? r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
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
