'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  ensureAccountReady,
  type DailyVerseReactFeedItem,
  type DailyVerseReactPreset,
  type DailyVerseReactTopPreset,
} from '@/lib/api';
import {
  DAILY_VERSE_REACT_EMOJIS,
  DAILY_VERSE_REACT_PHRASES,
} from '@/lib/daily_verse_react_presets';
import { errorMessage } from '@/components/ErrorBanner';
import { createPortal } from 'react-dom';
import { formatMsgTime } from '@/lib/im_ui';
import { formatRelativeTime } from '@/lib/campaign_ops';

type Props = {
  day: number;
  myReact: DailyVerseReactPreset | null;
  reactsCount: number;
  topPresets?: DailyVerseReactTopPreset[];
  onClose: () => void;
  onChanged: (next: {
    my_react: DailyVerseReactPreset | null;
    reacts_count: number;
    top_presets: DailyVerseReactTopPreset[];
  }) => void;
};

export default function DailyVerseReactSheet({
  day,
  myReact,
  reactsCount,
  topPresets: initialTop,
  onClose,
  onChanged,
}: Props) {
  const [emojis, setEmojis] = useState(DAILY_VERSE_REACT_EMOJIS);
  const [phrases, setPhrases] = useState(DAILY_VERSE_REACT_PHRASES);
  const [mine, setMine] = useState<DailyVerseReactPreset | null>(myReact);
  const [count, setCount] = useState(reactsCount);
  const [top, setTop] = useState<DailyVerseReactTopPreset[]>(initialTop ?? []);
  const [feed, setFeed] = useState<DailyVerseReactFeedItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // portal mount
  useEffect(() => { setMounted(true); }, []);

  // 下拉关闭：只在 feed 已滚到顶时触发
  const feedRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const draggingDownRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);

  const feedTimeLabel = (iso?: string) => {
    if (!iso) return '';
    const rel = formatRelativeTime(iso);
    const at = formatMsgTime(iso);
    if (rel && at) return `${rel} · ${at}`;
    return rel || at || '';
  };

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const r = await api.dailyVerseReacts(day, 40);
      setFeed(r.items || []);
      setCount(r.reacts_count ?? 0);
      setMine(r.my_react ?? null);
      setTop(r.top_presets || []);
      if (r.emojis?.length) setEmojis(r.emojis);
      if (r.phrases?.length) setPhrases(r.phrases);
      onChangedRef.current({
        my_react: r.my_react ?? null,
        reacts_count: r.reacts_count ?? 0,
        top_presets: r.top_presets || [],
      });
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e, '暂时无法加载大家的回应'));
    } finally {
      setFeedLoading(false);
    }
  }, [day]);

  useEffect(() => { void loadFeed(); }, [loadFeed]);

  const pick = async (preset: DailyVerseReactPreset) => {
    if (busyId) return;
    setBusyId(preset.id);
    setErr(null);
    try {
      await ensureAccountReady();
      const r = await api.upsertDailyVerseReact(preset.id, day);
      const nextMine = r.my_react ?? null;
      const nextCount = r.reacts_count ?? 0;
      const nextTop = r.top_presets || [];
      setMine(nextMine);
      setCount(nextCount);
      setTop(nextTop);
      onChangedRef.current({
        my_react: nextMine,
        reacts_count: nextCount,
        top_presets: nextTop,
      });
      // 立刻刷新 feed 以展示自己
      void loadFeed();
    } catch (e) {
      setErr(errorMessage(e, '暂时无法回应，请稍后再试'));
    } finally {
      setBusyId(null);
    }
  };

  // ── 下拉关闭手势 ──
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
    draggingDownRef.current = false;
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    if (startY == null) return;
    const dy = (e.touches[0]?.clientY ?? startY) - startY;
    const atTop = (feedRef.current?.scrollTop ?? 0) <= 0;
    if (dy > 0 && atTop) {
      draggingDownRef.current = true;
      setDragOffset(Math.min(dy, 160));
      // 阻止传递到 HomePage，防止触发首页滑动
      e.stopPropagation();
    } else if (draggingDownRef.current) {
      // 中途改回上滑，重置
      draggingDownRef.current = false;
      setDragOffset(0);
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    touchStartYRef.current = null;
    const dy = startY != null ? (e.changedTouches[0]?.clientY ?? startY) - startY : 0;
    const should = draggingDownRef.current && dy > 72;
    draggingDownRef.current = false;
    setDragOffset(0);
    if (should) onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="sheet-backdrop dv-react-backdrop"
      onClick={onClose}
    >
      <div
        className="sheet card dv-react-sheet"
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { touchStartYRef.current = null; draggingDownRef.current = false; setDragOffset(0); }}
        onWheel={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="今日回应"
      >
        {/* grab bar + 标题 */}
        <div className="half-sheet-grab" aria-hidden />
        <div className="dv-react-header">
          <strong className="dv-react-title">今日回应</strong>
          <button type="button" className="text-link dv-react-close" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        {/* ── 上：大家的回应（可滚动） ── */}
        <div
          className="dv-react-feed-area"
          ref={feedRef}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {feedLoading && feed.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, padding: '12px 0' }}>加载中…</p>
          ) : feed.length === 0 ? (
            <div className="dv-react-empty">
              <div className="dv-react-empty-emojis" aria-hidden>
                <span>🙏</span>
                <span>✨</span>
                <span>❤️</span>
                <span>🕊️</span>
              </div>
              <p className="dv-react-empty-title">
                {mine ? '你已回应，等候更多伙伴加入' : '还没有人回应'}
              </p>
              <p className="muted dv-react-empty-subtitle">
                {mine ? '今天的回应已经送出，愿更多读经伙伴一起被经文触动。' : '你可以做今天第一个回应的人。'}
              </p>
            </div>
          ) : (
            <ul className="dv-react-feed-list">
              {feed.map((item, i) => (
                <li key={`${item.user_code}-${item.created_at}-${i}`}>
                  <div className="dv-feed-left">
                    <span className="dv-feed-name">{item.display_name}</span>
                    <span className="dv-feed-time">{feedTimeLabel(item.created_at)}</span>
                  </div>
                  <span className="dv-feed-preset">
                    <span aria-hidden>{item.preset.emoji}</span>
                    <span>{item.preset.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── 下：我来回应（固定，紧凑） ── */}
        <div
          className="dv-react-picker"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {mine && (
            <p className="dv-react-mine-label">
              <span aria-hidden>{mine.emoji}</span>
              我已回应：{mine.label}
              <span className="muted dv-react-mine-cancel">（再次点击可取消）</span>
            </p>
          )}
          <div className="dv-react-emoji-row" role="list">
            {emojis.map((p) => {
              const active = mine?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  className={`dv-react-chip${active ? ' is-active' : ''}`}
                  disabled={!!busyId}
                  aria-pressed={active}
                  aria-label={p.label}
                  title={p.label}
                  onClick={() => void pick(p)}
                >
                  {p.emoji}
                </button>
              );
            })}
          </div>
          <div className="dv-react-phrase-row" role="list">
            {phrases.map((p) => {
              const active = mine?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  className={`dv-react-phrase${active ? ' is-active' : ''}`}
                  disabled={!!busyId}
                  aria-pressed={active}
                  onClick={() => void pick(p)}
                >
                  <span aria-hidden>{p.emoji}</span>
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
          {err && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }} role="alert">{err}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
