'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import ReaderSheetPortal from '@/components/reader/ReaderSheetPortal';
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
  const onChangedRef = useRef(onChanged);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchDraggingRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  onChangedRef.current = onChanged;

  const feedTitle = useMemo(() => {
    if (count <= 0) return '还没有人回应';
    return `${count.toLocaleString()} 位读经伙伴已回应`;
  }, [count]);

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

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

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
      void loadFeed();
    } catch (e) {
      setErr(errorMessage(e, '暂时无法回应，请稍后再试'));
    } finally {
      setBusyId(null);
    }
  };

  const feedTimeLabel = (iso?: string) => {
    if (!iso) return '';
    const rel = formatRelativeTime(iso);
    const at = formatMsgTime(iso);
    if (rel && at) return `${rel} · ${at}`;
    return rel || at || '';
  };

  const beginDrag = (clientY: number) => {
    touchStartYRef.current = clientY;
    touchDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    if (startY == null) return;
    const currentY = e.touches[0]?.clientY ?? startY;
    const deltaY = currentY - startY;
    const feedTop = feedRef.current?.scrollTop ?? 0;
    if (deltaY > 0 && feedTop <= 0) {
      touchDraggingRef.current = true;
      setDragOffset(Math.min(deltaY, 160));
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    touchStartYRef.current = null;
    if (startY == null) return;
    const endY = e.changedTouches[0]?.clientY ?? startY;
    const deltaY = endY - startY;
    const shouldClose = touchDraggingRef.current && deltaY > 72;
    touchDraggingRef.current = false;
    setDragOffset(0);
    if (shouldClose) onClose();
  };

  return (
    <ReaderSheetPortal
      onClose={onClose}
      backdropClassName="sheet-backdrop-above-tab"
      sheetClassName="sheet card daily-verse-react-sheet"
    >
      <div
        ref={sheetRef}
        className="daily-verse-react-sheet-inner"
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
        onTouchStart={(e) => beginDrag(e.touches[0]?.clientY ?? 0)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStartYRef.current = null;
          touchDraggingRef.current = false;
          setDragOffset(0);
        }}
        role="dialog"
        aria-label="今日回应"
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row group-settings-sheet-head daily-verse-react-sheet-head">
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
          <strong>今日回应</strong>
          <button type="button" className="text-link" onClick={onClose}>
            收起
          </button>
        </div>

        <div className="daily-verse-react-feed-panel" ref={feedRef}>
          <p className="muted daily-verse-react-hint">
            下拉可关闭；上下滑动可查看大家的回应。
          </p>

          {top.length > 0 && (
            <>
              <p className="daily-verse-react-section-label">大家最常回应</p>
              <div className="daily-verse-react-top" role="list">
                {top.map((t) => (
                  <span key={t.id} className="daily-verse-react-top-item" role="listitem">
                    <span aria-hidden>{t.emoji}</span>
                    <span>{t.label}</span>
                    <span className="muted">{t.count}</span>
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="daily-verse-react-feed-head">
            <div>
              <p className="daily-verse-react-section-label" style={{ marginBottom: 4 }}>
                看看大家
              </p>
              <p className="muted daily-verse-react-feed-subtitle">{feedTitle}</p>
            </div>
          </div>

          {feedLoading && feed.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>加载中…</p>
          ) : feed.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>还没有人回应，来做第一个吧。</p>
          ) : (
            <ul className="daily-verse-react-feed">
              {feed.map((item, i) => (
                <li key={`${item.user_code}-${item.created_at}-${i}`}>
                  <div className="daily-verse-react-feed-main">
                    <span className="daily-verse-react-feed-name">{item.display_name}</span>
                    <span className="daily-verse-react-feed-meta">{feedTimeLabel(item.created_at)}</span>
                  </div>
                  <span className="daily-verse-react-feed-preset">
                    <span aria-hidden>{item.preset.emoji}</span>
                    {item.preset.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="daily-verse-react-picker">
          <p className="muted daily-verse-react-hint">
            点选表情或短语，每人每天一条；再点同一选项可取消。
          </p>

          <p className="daily-verse-react-section-label">我来回应</p>
          <div className="daily-verse-react-emoji-grid" role="list">
            {emojis.map((p) => {
              const active = mine?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  className={`daily-verse-react-chip${active ? ' is-active' : ''}`}
                  disabled={!!busyId}
                  aria-pressed={active}
                  aria-label={p.label}
                  title={p.label}
                  onClick={() => void pick(p)}
                >
                  <span aria-hidden>{p.emoji}</span>
                </button>
              );
            })}
          </div>

          <div className="daily-verse-react-phrase-list" role="list">
            {phrases.map((p) => {
              const active = mine?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  className={`daily-verse-react-phrase${active ? ' is-active' : ''}`}
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
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }} role="alert">
              {err}
            </p>
          )}
        </div>
      </div>
    </ReaderSheetPortal>
  );
}
