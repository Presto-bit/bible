'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
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
  onChangedRef.current = onChanged;

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

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet card daily-verse-react-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="今日回应"
      >
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>今日回应</strong>
          <SheetCloseButton onClick={onClose} />
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          点选表情或短语，每人每天一条；再点同一选项可取消。
          {count > 0 ? ` 已有 ${count.toLocaleString()} 人回应。` : ''}
        </p>

        <p className="daily-verse-react-section-label">表情</p>
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

        <p className="daily-verse-react-section-label">短语</p>
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

        {top.length > 0 && (
          <>
            <p className="daily-verse-react-section-label">今日最多</p>
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

        <p className="daily-verse-react-section-label">看看大家</p>
        {feedLoading && feed.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>加载中…</p>
        ) : feed.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>还没有人回应，来做第一个吧。</p>
        ) : (
          <ul className="daily-verse-react-feed">
            {feed.map((item, i) => (
              <li key={`${item.user_code}-${item.created_at}-${i}`}>
                <span className="daily-verse-react-feed-name">{item.display_name}</span>
                <span className="daily-verse-react-feed-preset">
                  <span aria-hidden>{item.preset.emoji}</span>
                  {item.preset.label}
                </span>
              </li>
            ))}
          </ul>
        )}

        {err && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }} role="alert">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}
