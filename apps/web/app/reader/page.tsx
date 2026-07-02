'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type BibleBook, type DictEntity } from '@/lib/api';
import CatalogView from '@/components/reader/CatalogView';
import ReaderView from '@/components/reader/ReaderView';
import { getLastRead } from '@/lib/reading';
import { hydratePlanFromUrl, type PlanReadingMeta } from '@/lib/plan_reading';
import { clearReaderChrome } from '@/lib/reader_chrome';
import { parseMarkRef } from '@/lib/mark_ref';

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
  const [chapterPick, setChapterPick] = useState<BibleBook | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dict, setDict] = useState<DictEntity[]>([]);
  const [dictPopup, setDictPopup] = useState<DictEntity | null>(null);
  const [planMeta, setPlanMeta] = useState<PlanReadingMeta | null>(null);
  const [flashRef, setFlashRef] = useState<string | null>(null);

  const dictByName = useMemo(() => {
    const m = new Map<string, DictEntity>();
    for (const e of dict) {
      if (e.name) m.set(e.name, e);
      const aliases = (e as DictEntity & { aliases?: string[] }).aliases;
      if (aliases) for (const a of aliases) if (a) m.set(a, e);
    }
    return m;
  }, [dict]);

  const properNounRe = useMemo(() => {
    const names = Array.from(dictByName.keys())
      .filter((n) => n.length >= 2)
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (names.length === 0) return null;
    return new RegExp(`(${names.join('|')})`, 'g');
  }, [dictByName]);

  const renderVerseText = useCallback(
    (text: string, keyBase: string) => {
      if (!properNounRe) return text;
      const parts = text.split(properNounRe);
      return parts.map((part, i) => {
        const entity = dictByName.get(part);
        if (entity) {
          return (
            <span
              key={`${keyBase}-pn${i}`}
              className="proper-noun"
              onClick={(e) => {
                e.stopPropagation();
                setDictPopup(entity);
              }}
            >
              {part}
            </span>
          );
        }
        return <span key={`${keyBase}-t${i}`}>{part}</span>;
      });
    },
    [properNounRe, dictByName],
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

  const inScriptureReading = Boolean(book && !catalogOpen && !chapterPick);

  useEffect(() => {
    if (!inScriptureReading) clearReaderChrome();
  }, [inScriptureReading]);

  useEffect(() => {
    api.dictionary().then((d) => setDict(d.entities || [])).catch(() => setDict([]));
    api
      .books()
      .then(async (d) => {
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

  if (chapterPick) {
    const b = chapterPick;
    return (
      <main className="container">
        <div className="reader-bar" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>
            <button type="button" className="icon-btn" style={{ marginRight: 8 }} onClick={() => setChapterPick(null)} aria-label="返回">‹</button>
            {b.name}
            <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>共 {b.chapter_count} 章</span>
          </h2>
        </div>
        <div className="chapter-grid">
          {Array.from({ length: b.chapter_count }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`chapter-cell${book?.id === b.id && chapter === n ? ' chapter-cell-active' : ''}`}
              onClick={() => {
                setChapter(n);
                setBook(b);
                setChapterPick(null);
                setCatalogOpen(false);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (catalogOpen && book) {
    return (
      <CatalogView
        books={books}
        currentBookId={book.id}
        showBack
        onBack={() => setCatalogOpen(false)}
        onPickBook={setChapterPick}
        bookAbbr={bookAbbr}
      />
    );
  }

  if (!book) {
    return (
      <CatalogView
        books={books}
        showBack={false}
        onPickBook={setChapterPick}
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
        onChapterChange={setChapter}
        onPickBook={() => setCatalogOpen(true)}
        bookAbbr={bookAbbr}
        renderVerseText={renderVerseText}
        planMeta={planMeta}
        onPlanMetaChange={setPlanMeta}
        onPlanJump={handlePlanJump}
        externalOverlayOpen={Boolean(dictPopup)}
        flashRef={flashRef}
      />
      {dictPopup && (
        <div className="sheet-backdrop" onClick={() => setDictPopup(null)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <h3 style={{ margin: 0 }}>
                {dictPopup.name}
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{dictPopup.type}</span>
              </h3>
              <button type="button" className="text-link" onClick={() => setDictPopup(null)}>关闭</button>
            </div>
            <p style={{ lineHeight: 1.7, marginTop: 8 }}>{dictPopup.summary}</p>
            {dictPopup.refs?.length > 0 && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                参考：{dictPopup.refs.slice(0, 6).join(' · ')}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
