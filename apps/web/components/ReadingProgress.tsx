'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, type BibleBook } from '@/lib/api';
import { bookProgressMap, lastChapterOf, type BookProgress } from '@/lib/reading';

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
const abbr = (name: string) => BOOK_ABBR[name] ?? name.slice(0, 1);

function bookState(p: BookProgress | undefined): 'done' | 'reading' | 'todo' {
  if (!p || (p.passes === 0 && p.distinctChapters === 0)) return 'todo';
  if (p.passes >= 1) return 'done';
  if (p.distinctChapters > 0) return 'reading';
  return 'todo';
}

function bookHref(bookId: string): string {
  const ch = lastChapterOf(bookId);
  return `/reader?book=${bookId}&chapter=${ch && ch > 0 ? ch : 1}`;
}

export default function ReadingProgress() {
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [open, setOpen] = useState(false);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    api.books().then((d) => setBooks(d.books)).catch(() => setBooks([]));
  }, []);

  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === 'visible') setRev((r) => r + 1);
    };
    document.addEventListener('visibilitychange', bump);
    window.addEventListener('focus', bump);
    return () => {
      document.removeEventListener('visibilitychange', bump);
      window.removeEventListener('focus', bump);
    };
  }, []);

  const totals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of books) m[b.id] = b.chapter_count;
    return m;
  }, [books]);

  const progress = useMemo(() => bookProgressMap(totals), [totals, rev]);

  const totalBooks = books.length;
  const readBooks = useMemo(
    () =>
      Object.values(progress).filter((p) => p.passes >= 1 || p.distinctChapters > 0)
        .length,
    [progress],
  );
  const doneBooks = useMemo(
    () => Object.values(progress).filter((p) => p.passes >= 1).length,
    [progress],
  );
  const overallPct =
    totalBooks > 0 ? Math.round((readBooks / totalBooks) * 100) : 0;

  const ot = books.filter((b) => b.testament.toUpperCase().startsWith('O'));
  const nt = books.filter((b) => !b.testament.toUpperCase().startsWith('O'));

  const renderGroup = (label: string, list: BibleBook[]) => (
    <>
      <p className="section-head">{label}</p>
      <div className="catalog-grid">
        {list.map((b) => {
          const p = progress[b.id];
          const st = bookState(p);
          const pct =
            st === 'done'
              ? 100
              : b.chapter_count > 0
                ? Math.round(((p?.distinctChapters || 0) / b.chapter_count) * 100)
                : 0;
          return (
            <a key={b.id} href={bookHref(b.id)} className={`catalog-card catalog-card-${st}`}>
              {st !== 'todo' && <span className={`catalog-flag catalog-flag-${st}`} />}
              <span className="catalog-abbr">{abbr(b.name)}</span>
              <span className="catalog-name">{b.name}</span>
              <span className="catalog-ch">
                {st === 'done' ? '✓ 通读' : st === 'reading' ? `${pct}%` : `${b.chapter_count} 章`}
              </span>
            </a>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        className="card progress-card"
        onClick={() => {
          setRev((r) => r + 1);
          setOpen(true);
        }}
      >
        <div className="section-row" style={{ marginTop: 0 }}>
          <span>读经旅程</span>
          <span className="muted">目录 ›</span>
        </div>
        <div className="progress-summary">
          <div className="progress-ring" style={{ ['--pct' as string]: overallPct }}>
            <span>{overallPct}%</span>
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              已读 {readBooks} / {totalBooks} 卷
              {doneBooks > 0 ? ` · 通读 ${doneBooks} 卷` : ''}
            </p>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              点击查看目录与进度
            </p>
          </div>
        </div>
      </button>

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            className="sheet card"
            style={{ maxHeight: '88vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-row" style={{ marginTop: 0 }}>
              <h3 style={{ margin: 0 }}>读经目录</h3>
              <button type="button" className="text-link" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>
            {ot.length > 0 && renderGroup('旧约', ot)}
            {nt.length > 0 && renderGroup('新约', nt)}
          </div>
        </div>
      )}
    </>
  );
}
