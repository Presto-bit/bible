'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BibleBook } from '@/lib/api';
import { bibleBooks } from '@/lib/bible_client';
import {
  bookProgressMap,
  formatBookProgressLabel,
  lastChapterOf,
  readEvents,
  type BookProgress,
} from '@/lib/reading';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import { Pressable } from '@/components/ui/Pressable';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useVerticalSwipeDismiss } from '@/lib/use_vertical_swipe_dismiss';

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

function bookState(p: BookProgress | undefined): 'done' | 'reading' | 'reread' | 'todo' {
  if (!p || (p.passes === 0 && p.distinctChapters === 0)) return 'todo';
  if (p.passes >= 1 && p.distinctChapters === 0) return 'done';
  if (p.passes >= 1 && p.distinctChapters > 0) return 'reread';
  if (p.distinctChapters > 0) return 'reading';
  return 'todo';
}

function bookHref(bookId: string): string {
  const ch = lastChapterOf(bookId);
  return `/reader?book=${bookId}&chapter=${ch && ch > 0 ? ch : 1}`;
}

export default function ReadingProgress({
  variant = 'card',
}: {
  variant?: 'card' | 'footprint';
}) {
  const router = useRouter();
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [open, setOpen] = useState(false);
  const [rev, setRev] = useState(0);
  const sheetBodyRef = useRef<HTMLDivElement | null>(null);
  const swipe = useVerticalSwipeDismiss({
    onDismiss: () => setOpen(false),
    scrollRef: sheetBodyRef,
  });

  useEffect(() => {
    bibleBooks().then(setBooks).catch(() => setBooks([]));
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
  const lastFinished = useMemo(() => {
    const events = readEvents();
    let bestTs = -1;
    let name = '';
    for (const b of books) {
      const p = progress[b.id];
      if (!p || p.passes < 1) continue;
      let ts = 0;
      for (const e of events) {
        if (e.book === b.id && e.ts > ts) ts = e.ts;
      }
      if (ts >= bestTs) {
        bestTs = ts;
        name = b.name;
      }
    }
    return name;
  }, [books, progress, rev]);
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
          return (
            <a
              key={b.id}
              href={bookHref(b.id)}
              className={`catalog-card catalog-card-${st === 'reread' ? 'reading' : st}`}
            >
              {st !== 'todo' && (
                <span className={`catalog-flag catalog-flag-${st === 'reread' ? 'reading' : st}`} />
              )}
              <span className="catalog-abbr">{abbr(b.name)}</span>
              <span className="catalog-name">{b.name}</span>
              <span className="catalog-ch">
                {formatBookProgressLabel(p, b.chapter_count)}
              </span>
            </a>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      {variant === 'footprint' ? (
        <Pressable
          className="profile-footprint-trigger is-journey"
          press="card"
          aria-label="打开读经旅程"
          onTap={() => {
            markRouteNavigation();
            router.push('/profile/journey');
          }}
        >
          <svg className="journey-card-art" viewBox="0 0 160 120" aria-hidden>
            <circle cx="108" cy="78" r="30" fill="none" stroke="var(--accent, #8fa88a)" strokeWidth="12" />
            <rect x="118" y="52" width="52" height="52" rx="14" fill="var(--dawn-gold, #d4a056)" />
            <circle cx="148" cy="28" r="22" fill="var(--accent-deep, #4a6b52)" />
          </svg>
          <span className="profile-footprint-label">
            <span className="profile-footprint-kind">旅程</span>
          </span>
          <span className="profile-footprint-body">
            <span className="journey-card-copy">
              <strong className={`profile-footprint-value${doneBooks > 0 ? '' : ' is-empty'}`}>
                {doneBooks > 0 ? `${doneBooks} 卷已走完` : '还没有走完的卷'}
              </strong>
              <span className="journey-card-sub">
                {lastFinished ? `最近完成 ${lastFinished}` : `全经 ${totalBooks || 66} 卷`}
              </span>
            </span>
          </span>
        </Pressable>
      ) : (
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
      )}

      {open && (
        <AppBodyPortal onTabAway={() => setOpen(false)}>
          <div className="sheet-backdrop" data-dismiss-on-tab-nav onClick={() => setOpen(false)}>
            <div
              ref={sheetBodyRef}
              className="sheet card reading-journey-sheet"
              style={
                swipe.dragOffset > 0
                  ? {
                      maxHeight: '88vh',
                      overflowY: 'auto',
                      transform: `translateY(${swipe.dragOffset}px)`,
                      transition: 'none',
                    }
                  : { maxHeight: '88vh', overflowY: 'auto' }
              }
              onClick={(e) => e.stopPropagation()}
              onTouchStart={swipe.onTouchStart}
              onTouchMove={swipe.onTouchMove}
              onTouchEnd={swipe.onTouchEnd}
              onTouchCancel={swipe.onTouchCancel}
            >
              <div className="half-sheet-grab" aria-hidden />
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
        </AppBodyPortal>
      )}
    </>
  );
}
