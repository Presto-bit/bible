'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import type { BibleBook } from '@/lib/api';
import { bibleBooks } from '@/lib/bible_client';
import {
  bookProgressMap,
  currentPassChapters,
  readEvents,
  type BookProgress,
} from '@/lib/reading';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import { Pressable } from '@/components/ui/Pressable';

const ABBR: Record<string, string> = {
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

const SECTION_AT: Record<string, string> = {
  创世记: '律法',
  约书亚记: '历史',
  约伯记: '诗歌',
  以赛亚书: '先知',
  马太福音: '福音',
  罗马书: '书信',
  启示录: '启示',
};

type Side = 'ot' | 'nt';
type View = { x: number; y: number; scale: number };

function shortName(name: string) {
  return ABBR[name] ?? name.slice(0, 1);
}

function isOt(book: BibleBook) {
  return book.testament.toUpperCase().startsWith('O');
}

function ringOf(p: BookProgress | undefined, total: number) {
  if (!p || total <= 0 || (p.passes === 0 && p.distinctChapters === 0)) {
    return { progress: 0, plus: 0 };
  }
  if (p.passes >= 1 && p.distinctChapters === 0) {
    return { progress: 1, plus: Math.max(0, p.passes - 1) };
  }
  return {
    progress: Math.min(1, p.distinctChapters / total),
    plus: p.passes >= 1 ? p.passes : 0,
  };
}

function waveLayout(count: number) {
  const step = count > 80 ? 58 : count > 40 ? 72 : 86;
  const points = Array.from({ length: count }, (_, i) => ({
    x: 168 + Math.sin(i * 0.85) * 92,
    y: 36 + i * step,
  }));
  return { points, width: 340, height: Math.max(240, 88 + count * step) };
}

function chapterState(ch: number, read: Set<number>, complete: boolean, nextOpen: number) {
  if (complete || read.has(ch)) return { progress: 1, open: true, here: false };
  if (ch === nextOpen) return { progress: 0.35, open: true, here: true };
  return { progress: 0, open: false, here: false };
}

export default function JourneyMap() {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<View>({ x: 8, y: 12, scale: 1 });
  const dragRef = useRef<{
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number; x: number; y: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());

  const [mounted, setMounted] = useState(false);
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [failed, setFailed] = useState('');
  const [rev, setRev] = useState(0);
  const [side, setSide] = useState<Side>('ot');
  const [bookId, setBookId] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [view, setView] = useState<View>({ x: 8, y: 12, scale: 1 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    bibleBooks()
      .then((list) => {
        if (!cancelled) setBooks(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailed(err instanceof Error ? err.message : '无法加载经卷目录');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === 'visible') setRev((n) => n + 1);
    };
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', bump);
    return () => {
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', bump);
    };
  }, []);

  useEffect(() => {
    const width = stageRef.current?.clientWidth ?? 360;
    const next = { x: Math.max(12, (width - 340) / 2), y: 12, scale: 1 };
    viewRef.current = next;
    setView(next);
    setPicked(null);
  }, [side, bookId]);

  const totals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of books) m[b.id] = b.chapter_count;
    return m;
  }, [books]);

  const progress = useMemo(
    () => (mounted ? bookProgressMap(totals) : {}),
    [totals, mounted, rev],
  );

  const list = books.filter((b) => (side === 'ot' ? isOt(b) : !isOt(b)));
  const openBook = books.find((b) => b.id === bookId) ?? null;
  const nodes = openBook ? openBook.chapter_count : list.length;
  const layout = waveLayout(nodes);
  const bookProgress = openBook ? progress[openBook.id] : undefined;
  const bookComplete = Boolean(
    bookProgress && bookProgress.passes >= 1 && bookProgress.distinctChapters === 0,
  );
  const readChapters = useMemo(() => {
    if (!mounted || !openBook) return new Set<number>();
    return new Set(currentPassChapters(openBook.id, openBook.chapter_count));
  }, [mounted, openBook, rev]);
  const nextOpen = useMemo(() => {
    if (!openBook || bookComplete) return 0;
    for (let ch = 1; ch <= openBook.chapter_count; ch += 1) {
      if (!readChapters.has(ch)) return ch;
    }
    return 0;
  }, [openBook, bookComplete, readChapters]);

  const hereId = useMemo(() => {
    if (!mounted) return '';
    const events = readEvents();
    let best = '';
    let bestTs = -1;
    for (const b of list) {
      const ring = ringOf(progress[b.id], b.chapter_count);
      if (ring.progress <= 0 || ring.progress >= 1) continue;
      let ts = 0;
      for (const e of events) {
        if (e.book === b.id && e.ts > ts) ts = e.ts;
      }
      if (ts >= bestTs) {
        bestTs = ts;
        best = b.id;
      }
    }
    return best;
  }, [list, progress, mounted, rev]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cur = viewRef.current;
      const nextScale = Math.min(2.2, Math.max(0.65, cur.scale * (e.deltaY > 0 ? 0.92 : 1.08)));
      const k = nextScale / cur.scale;
      const next = {
        scale: nextScale,
        x: mx - k * (mx - cur.x),
        y: my - k * (my - cur.y),
      };
      viewRef.current = next;
      setView(next);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [books.length, bookId]);

  const applyView = (next: View) => {
    viewRef.current = next;
    setView(next);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.journey-chip')) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stageRef.current?.setPointerCapture(e.pointerId);
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchRef.current = {
        dist: Math.max(1, dist),
        scale: viewRef.current.scale,
        x: viewRef.current.x,
        y: viewRef.current.y,
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      vx: viewRef.current.x,
      vy: viewRef.current.y,
      moved: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pt = pointersRef.current.get(e.pointerId);
    if (!pt) return;
    pt.x = e.clientX;
    pt.y = e.clientY;
    if (pointersRef.current.size >= 2 && pinchRef.current && stageRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = stageRef.current.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - rect.left;
      const my = (a.y + b.y) / 2 - rect.top;
      const pinch = pinchRef.current;
      const nextScale = Math.min(2.2, Math.max(0.65, pinch.scale * (dist / pinch.dist)));
      const k = nextScale / pinch.scale;
      applyView({
        scale: nextScale,
        x: mx - k * (mx - pinch.x),
        y: my - k * (my - pinch.y),
      });
      setDragging(true);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    setDragging(true);
    applyView({ ...viewRef.current, x: drag.vx + dx, y: drag.vy + dy });
  };

  const finishPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const moved = Boolean(drag && drag.id === e.pointerId && drag.moved);
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (drag?.id === e.pointerId) dragRef.current = null;
    if (pointersRef.current.size === 0) setDragging(false);
    if (moved) return;
    const node = (e.target as HTMLElement).closest<HTMLElement>('[data-journey-node]');
    if (!node) {
      setPicked(null);
      return;
    }
    if (node.dataset.kind === 'book' && node.dataset.id) {
      setBookId(node.dataset.id);
      return;
    }
    if (node.dataset.kind === 'chapter' && node.dataset.ch) {
      setPicked(Number(node.dataset.ch));
    }
  };

  const openReader = (book: BibleBook, chapter: number) => {
    markRouteNavigation();
    router.push(`/reader?book=${encodeURIComponent(book.id)}&chapter=${chapter}`);
  };

  const pickedState = openBook && picked
    ? chapterState(picked, readChapters, bookComplete, nextOpen)
    : null;
  const pickedPoint = picked ? layout.points[picked - 1] : null;

  return (
    <>
      <header className="journey-head">
        <PageBackBar href="/profile" label="我的" onClick={() => markRouteNavigation()} />
        {openBook ? (
          <div className="journey-book-head">
            <strong className="journey-book-name">{openBook.name}</strong>
            <Pressable className="journey-back-books" onTap={() => setBookId(null)}>
              各卷
            </Pressable>
          </div>
        ) : (
          <div className="journey-pills" role="tablist" aria-label="约">
            <Pressable
              role="tab"
              aria-selected={side === 'ot'}
              className={`journey-pill${side === 'ot' ? ' is-on' : ''}`}
              onTap={() => setSide('ot')}
            >
              旧约
            </Pressable>
            <Pressable
              role="tab"
              aria-selected={side === 'nt'}
              className={`journey-pill${side === 'nt' ? ' is-on' : ''}`}
              onTap={() => setSide('nt')}
            >
              新约
            </Pressable>
          </div>
        )}
      </header>
      <div
        ref={stageRef}
        className={`journey-stage${dragging ? ' is-drag' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        {failed && <p className="journey-note">{failed}</p>}
        {!failed && books.length === 0 && <p className="journey-note">正在打开旅程</p>}
        {books.length > 0 && (
          <div
            className="journey-world"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            }}
          >
            <svg className="journey-path" width={layout.width} height={layout.height} aria-hidden>
              <polyline points={layout.points.map((p) => `${p.x},${p.y + 20}`).join(' ')} />
            </svg>
            {openBook
              ? Array.from({ length: openBook.chapter_count }, (_, i) => {
                  const ch = i + 1;
                  const point = layout.points[i];
                  const st = chapterState(ch, readChapters, bookComplete, nextOpen);
                  return (
                    <button
                      key={ch}
                      type="button"
                      className={`journey-node${st.here ? ' is-here' : ''}`}
                      style={{ left: point.x, top: point.y }}
                      data-journey-node=""
                      data-kind="chapter"
                      data-ch={ch}
                    >
                      <span className="journey-ring" style={{ ['--p' as string]: st.progress }}>
                        <i />
                      </span>
                      <span className="journey-node-label">{ch}</span>
                    </button>
                  );
                })
              : list.map((b, i) => {
                  const point = layout.points[i];
                  const ring = ringOf(progress[b.id], b.chapter_count);
                  const label = ring.plus > 0 ? `${shortName(b.name)}+${ring.plus}` : shortName(b.name);
                  const section = SECTION_AT[b.name];
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={`journey-node${hereId === b.id ? ' is-here' : ''}`}
                      style={{ left: point.x, top: point.y }}
                      data-journey-node=""
                      data-kind="book"
                      data-id={b.id}
                    >
                      {section ? <span className="journey-section">{section}</span> : null}
                      <span className="journey-ring" style={{ ['--p' as string]: ring.progress }}>
                        <i />
                      </span>
                      <span className="journey-node-label">{label}</span>
                      {ring.progress === 0 ? (
                        <span className="journey-node-sub">{b.chapter_count} 章</span>
                      ) : null}
                    </button>
                  );
                })}
            {openBook && pickedPoint && pickedState && picked ? (
              <div
                className="journey-chip"
                style={{ left: pickedPoint.x, top: pickedPoint.y + 72 }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <strong>
                  {openBook.name} {picked}
                </strong>
                <p>{pickedState.open ? '可以读这一章' : '走到这一章再打开'}</p>
                {pickedState.open ? (
                  <Pressable onTap={() => openReader(openBook, picked)}>去读</Pressable>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
