'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, type BibleBook } from '@/lib/api';
import { dailyMinutes, rangeStats, type RangeStats } from '@/lib/reading';
import { registrationYear } from '@/lib/api';

type Mode = 'day' | 'week' | 'month' | 'year';

const MODES: { id: Mode; label: string }[] = [
  { id: 'day', label: '日' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
  { id: 'year', label: '年' },
];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

interface Cell {
  label: string;
  sub?: string;
  start: number;
  end: number;
  minutes: number;
  inMonth?: boolean; // 仅日历用：是否本月
  blank?: boolean;
}

export default function ReportPage() {
  const [mode, setMode] = useState<Mode>('day');
  const [cursor, setCursor] = useState(() => new Date());
  const [sel, setSel] = useState<{ start: number; end: number; label: string } | null>(null);
  const [books, setBooks] = useState<Record<string, BibleBook>>({});
  const [minutesByDay, setMinutesByDay] = useState<Record<string, number>>({});

  useEffect(() => {
    setMinutesByDay(dailyMinutes());
    api
      .books()
      .then((d) => {
        const m: Record<string, BibleBook> = {};
        d.books.forEach((b) => (m[b.id] = b));
        setBooks(m);
      })
      .catch(() => {});
  }, []);

  const minutesIn = (start: number, end: number) => {
    let total = 0;
    for (const [date, mins] of Object.entries(minutesByDay)) {
      const t = new Date(`${date}T00:00:00`).getTime();
      if (t >= start && t < end) total += mins;
    }
    return total;
  };

  // 当前窗口的网格单元 + 标题。
  const { windowLabel, cells } = useMemo(() => {
    const c = cursor;
    if (mode === 'day') {
      const y = c.getFullYear();
      const mo = c.getMonth();
      const first = new Date(y, mo, 1);
      const daysInMonth = new Date(y, mo + 1, 0).getDate();
      const lead = first.getDay(); // 0=周日
      const out: Cell[] = [];
      for (let i = 0; i < lead; i++) out.push({ label: '', start: 0, end: 0, minutes: 0, blank: true });
      for (let d = 1; d <= daysInMonth; d++) {
        const s = new Date(y, mo, d).getTime();
        const e = new Date(y, mo, d + 1).getTime();
        out.push({ label: String(d), start: s, end: e, minutes: minutesIn(s, e), inMonth: true });
      }
      return { windowLabel: `${y} 年 ${mo + 1} 月`, cells: out };
    }
    if (mode === 'week') {
      // 当前月内的各周（周日起）。
      const y = c.getFullYear();
      const mo = c.getMonth();
      const first = new Date(y, mo, 1);
      const daysInMonth = new Date(y, mo + 1, 0).getDate();
      const out: Cell[] = [];
      let weekStart = new Date(y, mo, 1 - first.getDay());
      let idx = 1;
      while (weekStart.getTime() < new Date(y, mo, daysInMonth + 1).getTime()) {
        const s = startOfDay(weekStart);
        const we = new Date(weekStart);
        we.setDate(we.getDate() + 7);
        const e = startOfDay(we);
        const sd = new Date(s);
        const ed = new Date(e - 86400000);
        out.push({
          label: `第${idx}周`,
          sub: `${sd.getMonth() + 1}/${sd.getDate()}–${ed.getMonth() + 1}/${ed.getDate()}`,
          start: s,
          end: e,
          minutes: minutesIn(s, e),
        });
        weekStart = we;
        idx += 1;
      }
      return { windowLabel: `${y} 年 ${mo + 1} 月`, cells: out };
    }
    if (mode === 'month') {
      const y = c.getFullYear();
      const out: Cell[] = [];
      for (let mo = 0; mo < 12; mo++) {
        const s = new Date(y, mo, 1).getTime();
        const e = new Date(y, mo + 1, 1).getTime();
        out.push({ label: `${mo + 1}月`, start: s, end: e, minutes: minutesIn(s, e) });
      }
      return { windowLabel: `${y} 年`, cells: out };
    }
    // year：不做筛选，固定显示「注册年 → 当年」。
    const endY = new Date().getFullYear();
    const startY = Math.min(registrationYear(), endY);
    const out: Cell[] = [];
    for (let y = startY; y <= endY; y++) {
      const s = new Date(y, 0, 1).getTime();
      const e = new Date(y + 1, 0, 1).getTime();
      out.push({ label: `${y}`, start: s, end: e, minutes: minutesIn(s, e) });
    }
    return {
      windowLabel: startY === endY ? `${endY}` : `${startY}–${endY}`,
      cells: out,
    };
  }, [mode, cursor, minutesByDay]);

  const maxMin = Math.max(1, ...cells.map((c) => c.minutes));

  const move = (dir: number) => {
    const c = new Date(cursor);
    if (mode === 'day' || mode === 'week') c.setMonth(c.getMonth() + dir);
    else if (mode === 'month') c.setFullYear(c.getFullYear() + dir);
    else c.setFullYear(c.getFullYear() + dir * 8);
    setCursor(c);
    setSel(null);
  };

  // 统计范围：选中单元 → 该单元；否则整个窗口。
  const windowStart = cells.find((c) => !c.blank)?.start ?? startOfDay(new Date());
  const windowEnd = [...cells].reverse().find((c) => !c.blank)?.end ?? Date.now();
  const statStart = sel?.start ?? windowStart;
  const statEnd = sel?.end ?? windowEnd;
  const statLabel = sel?.label ?? windowLabel;

  const stats: RangeStats = useMemo(
    () => rangeStats(statStart, statEnd),
    [statStart, statEnd],
  );

  // 常读金句：拉取经文内容直接展示（按 book.chapter 缓存，最多 3 条）。
  const [verseTexts, setVerseTexts] = useState<Record<string, string>>({});
  useEffect(() => {
    const want = stats.topVerses.filter((v) => !(v.key in verseTexts));
    if (want.length === 0) return;
    const chapters = new Map<string, { book: string; chapter: number }>();
    for (const v of want) {
      const [b, c] = v.key.split('.');
      chapters.set(`${b}.${c}`, { book: b, chapter: Number(c) });
    }
    let cancelled = false;
    Promise.all(
      [...chapters.values()].map((cc) =>
        api
          .chapter(cc.book, cc.chapter)
          .then((d) => ({ cc, verses: d.verses }))
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const r of results) {
        if (!r) continue;
        for (const vs of r.verses) {
          next[`${r.cc.book}.${r.cc.chapter}.${vs.verse}`] = vs.text;
        }
      }
      if (Object.keys(next).length) setVerseTexts((p) => ({ ...p, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [stats.topVerses, verseTexts]);

  const bookName = (id: string) => books[id]?.name || id;
  const go = (bookId: string, chapter = 1) => {
    window.location.href = `/reader?book=${bookId}&chapter=${chapter}`;
  };

  const isCalendar = mode === 'day';
  const cols = mode === 'day' ? 7 : mode === 'week' ? 3 : 4;

  return (
    <main className="container">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <a href="/profile" className="icon-btn" aria-label="返回">←</a>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>读经回顾</h2>
        <Link href="/wrapped" className="muted" style={{ fontSize: 13 }}>Wrapped ›</Link>
      </header>

      <div className="seg-tabs" style={{ marginBottom: 12 }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`seg-tab ${mode === m.id ? 'seg-tab-active' : ''}`}
            onClick={() => {
              setMode(m.id);
              setSel(null);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'year' ? (
        <div className="year-switch year-switch-static" style={{ marginTop: 0, marginBottom: 12 }}>
          <span>{windowLabel}</span>
        </div>
      ) : (
        <div className="year-switch" style={{ marginTop: 0, marginBottom: 12 }}>
          <button type="button" onClick={() => move(-1)}>‹</button>
          <span>{windowLabel}</span>
          <button type="button" onClick={() => move(1)}>›</button>
        </div>
      )}

      {isCalendar && (
        <div className="cal-weekhead">
          {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      )}

      <div
        className="cal-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {cells.map((c, i) => {
          if (c.blank) return <span key={`b${i}`} />;
          const active = sel?.start === c.start;
          const intensity = c.minutes > 0 ? 0.18 + 0.82 * (c.minutes / maxMin) : 0;
          return (
            <button
              key={c.start}
              type="button"
              className={`cal-cell ${active ? 'cal-cell-active' : ''} ${isCalendar ? 'cal-cell-day' : ''}`}
              onClick={() =>
                setSel(
                  active
                    ? null
                    : { start: c.start, end: c.end, label: c.sub ? `${c.label} ${c.sub}` : c.label },
                )
              }
              style={
                c.minutes > 0
                  ? { background: `rgba(122, 90, 60, ${intensity})` }
                  : undefined
              }
            >
              <span className="cal-cell-label">{c.label}</span>
              {!isCalendar && <span className="cal-cell-sub">{c.sub}</span>}
              {c.minutes > 0 && (
                <span className="cal-cell-min">{c.minutes}′</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="report-tiles report-tiles-4" style={{ marginTop: 16 }}>
        <Tile value={stats.minutes} unit="分钟" label="阅读时长" />
        <Tile value={stats.days} unit="天" label="阅读天数" />
        <Tile value={stats.chapters} unit="章" label="完成章节" />
        <Tile value={stats.prayers} unit="次" label="祷告打卡" />
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        当前统计：{statLabel}
      </p>

      <h3 style={{ fontSize: 15, margin: '20px 0 10px' }}>常读的卷</h3>
      {stats.topBooks.length === 0 ? (
        <p className="muted">该时段暂无记录</p>
      ) : (
        <div className="rank-grid">
          {stats.topBooks.slice(0, 2).map((b) => (
            <button key={b.key} type="button" className="rank-row" onClick={() => go(b.key)}>
              <span className="rank-name">{bookName(b.key)}</span>
              <span className="muted">{b.count} 次 ›</span>
            </button>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 15, margin: '20px 0 10px' }}>常读的章</h3>
      {stats.topChapters.length === 0 ? (
        <p className="muted">该时段暂无记录</p>
      ) : (
        <div className="rank-grid">
          {stats.topChapters.slice(0, 2).map((c) => {
            const [bid, ch] = c.key.split('.');
            return (
              <button key={c.key} type="button" className="rank-row" onClick={() => go(bid, Number(ch))}>
                <span className="rank-name">{bookName(bid)} {ch}</span>
                <span className="muted">{c.count} 次 ›</span>
              </button>
            );
          })}
        </div>
      )}

      <h3 className="section-head verse-rank-title">常读的金句</h3>
      {stats.topVerses.length === 0 ? (
        <p className="muted">阅读时点选经文即可记录金句</p>
      ) : (
        <div className="verse-rank-list">
          {stats.topVerses.map((v, i) => {
            const [bid, ch, vs] = v.key.split('.');
            const text = verseTexts[v.key];
            return (
              <button key={v.key} type="button" className="verse-rank-card" onClick={() => go(bid, Number(ch))}>
                <div className="verse-rank-rank">#{i + 1}</div>
                <div className="verse-rank-body">
                  <div className="verse-rank-head">
                    <span className="verse-rank-ref">{bookName(bid)} {ch}:{vs}</span>
                    <span className="verse-rank-count">{v.count} 次</span>
                  </div>
                  {text ? (
                    <p className="verse-rank-quote">「{text}」</p>
                  ) : (
                    <p className="muted" style={{ fontSize: 13 }}>加载经文…</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Tile({ value, unit, label }: { value: number; unit: string; label: string }) {
  return (
    <div className="report-tile">
      <div className="report-tile-val">
        {value}
        <span className="report-tile-unit"> {unit}</span>
      </div>
      <div className="report-tile-label">{label}</div>
    </div>
  );
}
