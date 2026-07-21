'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  api,
  ensureAccountReady,
  type DevotionalCheckin,
  type DevotionalDayDetail,
} from '@/lib/api';
import {
  CHECKIN_EMOJI_OPTIONS,
  GENESIS_50_DEFAULT_DAY,
  GENESIS_50_SERIES_ID,
  formatParticipants,
  readLocalProgress,
  readWorkbookDraft,
  resolveEntryDay,
  tabLabel,
  writeLocalProgress,
  writeWorkbookDraft,
  type DevotionalTab,
  type WorkbookDraft,
} from '@/lib/devotional_local';
import { errorMessage } from '@/lib/friendly_error';
import PageBackBar from '@/components/PageBackBar';

type Props = { seriesId: string };

function parseFocusRanges(focus?: string): Array<{ start: number; end: number }> {
  if (!focus) return [];
  const out: Array<{ start: number; end: number }> = [];
  for (const part of focus.split(/[，,]/)) {
    const m = part.trim().match(/(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?/);
    if (!m) continue;
    const start = Number(m[2]);
    const end = Number(m[3] || m[2]);
    out.push({ start, end });
  }
  return out;
}

function isFocusVerse(verse: number, ranges: Array<{ start: number; end: number }>) {
  return ranges.some((r) => verse >= r.start && verse <= r.end);
}

export default function DevotionalSeriesClient({ seriesId }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const queryDay = Number(search.get('day') || '') || null;
  const panelRef = useRef<HTMLElement | null>(null);
  const scrollByTab = useRef<Partial<Record<DevotionalTab, number>>>({});

  const [day, setDay] = useState(() =>
    resolveEntryDay({ queryDay, seriesId, defaultDay: GENESIS_50_DEFAULT_DAY }),
  );
  const [tab, setTab] = useState<DevotionalTab>(() => readLocalProgress(seriesId)?.tab || 'scripture');
  const [data, setData] = useState<DevotionalDayDetail | null>(null);
  const [feed, setFeed] = useState<DevotionalCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState<Record<number, boolean>>({});
  const [draft, setDraft] = useState<WorkbookDraft>(() => readWorkbookDraft(seriesId, day));
  const [draftSavedFlash, setDraftSavedFlash] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [checkinEmoji, setCheckinEmoji] = useState<string>(CHECKIN_EMOJI_OPTIONS[0].emoji);
  const [checkinBody, setCheckinBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [feedShowAll, setFeedShowAll] = useState(false);
  const [focusOn, setFocusOn] = useState(true);

  const focusRanges = useMemo(
    () => parseFocusRanges(data?.focus_verses || data?.scripture?.focus_verses),
    [data],
  );

  const persistProgress = useCallback(
    async (nextDay: number, nextTab: DevotionalTab) => {
      writeLocalProgress(seriesId, nextDay, nextTab);
      try {
        await ensureAccountReady();
        await api.saveDevotionalProgress(seriesId, nextDay, nextTab);
      } catch {
        /* 本地续读优先 */
      }
    },
    [seriesId],
  );

  const loadDay = useCallback(
    async (nextDay: number, nextTab?: DevotionalTab) => {
      setLoading(true);
      setErr(null);
      setFeedExpanded(false);
      setFeedShowAll(false);
      setSuccessOpen(false);
      try {
        const detail = await api.devotionalDay(seriesId, nextDay);
        setData(detail);
        setDraft(readWorkbookDraft(seriesId, nextDay));
        const tabToUse = nextTab || (detail.last_tab as DevotionalTab) || tab;
        setTab(tabToUse);
        void persistProgress(nextDay, tabToUse);
        try {
          const f = await api.devotionalFeed(seriesId, nextDay);
          setFeed(f.items || []);
        } catch {
          setFeed([]);
        }
      } catch (e) {
        setErr(errorMessage(e, '加载失败'));
      } finally {
        setLoading(false);
      }
    },
    [seriesId, persistProgress, tab],
  );

  useEffect(() => {
    void loadDay(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, seriesId]);

  useEffect(() => {
    if (
      !draft.answers.some(Boolean) &&
      !draft.practiceNote &&
      draft.practiceIndex == null
    ) {
      return;
    }
    writeWorkbookDraft(seriesId, day, draft);
    setDraftSavedFlash(true);
    const t = window.setTimeout(() => setDraftSavedFlash(false), 1600);
    return () => window.clearTimeout(t);
  }, [draft, seriesId, day]);

  const switchTab = (t: DevotionalTab) => {
    if (panelRef.current) {
      scrollByTab.current[tab] = window.scrollY;
    }
    setTab(t);
    void persistProgress(day, t);
    requestAnimationFrame(() => {
      const y = scrollByTab.current[t];
      if (typeof y === 'number') window.scrollTo({ top: y });
    });
  };

  const changeDay = (d: number) => {
    scrollByTab.current = {};
    setDay(d);
    setPickerOpen(false);
    router.replace(`/devotionals/${seriesId}?day=${d}`);
  };

  const submitCheckin = async () => {
    if (!checkinEmoji) return;
    setBusy(true);
    try {
      await ensureAccountReady();
      const r = await api.upsertDevotionalCheckin(seriesId, day, checkinEmoji, checkinBody.trim() || undefined);
      setData((prev) =>
        prev
          ? {
              ...prev,
              my_checkin: r.checkin,
              my_days: r.my_days,
              day_checkins: r.day_checkins,
              participants_count: r.participants_count,
              checked_days: r.checked_days,
            }
          : prev,
      );
      const f = await api.devotionalFeed(seriesId, day);
      setFeed(f.items || []);
      setCheckinOpen(false);
      setSuccessOpen(true);
      setFeedExpanded(true);
    } catch (e) {
      setErr(errorMessage(e, '打卡失败'));
    } finally {
      setBusy(false);
    }
  };

  const toggleReact = async (cid: string, emoji: string) => {
    try {
      await ensureAccountReady();
      const r = await api.reactDevotionalCheckin(cid, emoji);
      setFeed((items) =>
        items.map((it) => (it.id === cid ? { ...it, reactions: r.reactions } : it)),
      );
    } catch (e) {
      setErr(errorMessage(e, '回应失败'));
    }
  };

  const sendComment = async (cid: string) => {
    const body = (commentDraft[cid] || '').trim();
    if (!body) return;
    try {
      await ensureAccountReady();
      const r = await api.commentDevotionalCheckin(cid, body);
      setFeed((items) =>
        items.map((it) =>
          it.id === cid
            ? { ...it, comments: [...(it.comments || []), r.comment] }
            : it,
        ),
      );
      setCommentDraft((m) => ({ ...m, [cid]: '' }));
      setCommentingId(null);
    } catch (e) {
      setErr(errorMessage(e, '评论失败'));
    }
  };

  if (loading && !data) {
    return (
      <main className="container devotional-page">
        <PageBackBar href="/" label="首页" />
        <p className="muted">加载中…</p>
      </main>
    );
  }

  if (err && !data) {
    return (
      <main className="container devotional-page">
        <PageBackBar href="/" label="首页" />
        <p className="muted" role="alert">{err}</p>
        <button type="button" className="btn" onClick={() => void loadDay(day)}>重试</button>
      </main>
    );
  }

  if (!data) return null;

  const checked = new Set(data.checked_days || []);
  const daysTotal = data.days_total || 50;
  const nextDay = day < daysTotal ? day + 1 : null;
  const visibleFeed = feedShowAll ? feed : feed.slice(0, 3);
  const bottomLabel =
    tab === 'scripture'
      ? '继续读灵修书信'
      : tab === 'letter'
        ? '进入默想与实践'
        : data.my_checkin
          ? `更新打卡 ${data.my_checkin.emoji}`
          : '完成本次灵修';

  const onBottomPrimary = () => {
    if (tab === 'scripture') {
      switchTab('letter');
      return;
    }
    if (tab === 'letter') {
      switchTab('workbook');
      return;
    }
    setCheckinBody(data.my_checkin?.body || '');
    setCheckinEmoji(data.my_checkin?.emoji || CHECKIN_EMOJI_OPTIONS[0].emoji);
    setCheckinOpen(true);
  };

  return (
    <main className="container devotional-page">
      <div className="devotional-sticky-top">
        <div className="devotional-sticky-bar">
          <PageBackBar href="/" label="首页" />
          <button type="button" className="devotional-day-picker" onClick={() => setPickerOpen(true)}>
            第 {day} 次 / {daysTotal}
            <span aria-hidden> ▾</span>
          </button>
        </div>
        <nav className="devotional-tabs" aria-label="内容标签">
          {(
            [
              ['scripture', '经文'],
              ['letter', '灵修书信'],
              ['workbook', '默想教材'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`devotional-tab${tab === id ? ' active' : ''}`}
              onClick={() => switchTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <header className="devotional-header">
        <h1>第{day}次｜{data.title}</h1>
        <p className="muted">
          {data.book_name}第{data.chapter}章
          {data.focus_verses ? ` · 重点 ${data.focus_verses}` : ''}
          {' · '}约 {data.workbook?.estimated_minutes || 18} 分钟
        </p>
        <p className="devotional-stats-line muted">
          已完成 {data.my_days}/{daysTotal}
          {' · '}
          {formatParticipants(data.participants_count)}
          {data.today_checkins > 0 ? ` · 今天 ${data.today_checkins} 人已完成` : ''}
        </p>
      </header>

      {err ? <p className="muted" role="alert" style={{ marginTop: 8 }}>{err}</p> : null}

      <section className="devotional-panel" ref={panelRef as never}>
        {tab === 'scripture' && (
          <div className="devotional-scripture">
            <div className="section-row">
              <strong>{data.book_name} {data.chapter}</strong>
              <div className="devotional-inline-actions">
                {focusRanges.length > 0 ? (
                  <button type="button" className="text-link" onClick={() => setFocusOn((v) => !v)}>
                    {focusOn ? '关闭重点高亮' : '显示重点高亮'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => router.push(`/reader?book=${data.book}&chapter=${data.chapter}`)}
                >
                  在圣经中打开 ›
                </button>
              </div>
            </div>
            <div className="devotional-verses">
              {(data.scripture?.verses || []).map((v) => (
                <p
                  key={v.verse}
                  className={`devotional-verse${focusOn && isFocusVerse(v.verse, focusRanges) ? ' is-focus' : ''}`}
                >
                  <sup>{v.verse}</sup>
                  {v.text}
                </p>
              ))}
            </div>
          </div>
        )}

        {tab === 'letter' && (
          <article className="devotional-letter">
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>约 5 分钟阅读</p>
            {data.letter.body.split(/\n+/).filter(Boolean).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            <div className="devotional-prayer-box">
              <strong>我们一起祷告</strong>
              <p>{data.letter.prayer}</p>
            </div>
          </article>
        )}

        {tab === 'workbook' && (
          <article className="devotional-workbook">
            <div className="section-row" style={{ marginBottom: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {draftSavedFlash ? '已自动保存' : '答案会自动保存'}
              </span>
            </div>
            <section>
              <h3>今日重点</h3>
              <p>{data.workbook.today_focus}</p>
            </section>
            <section>
              <h3>从古代处境读经</h3>
              <p><strong>理性提问</strong> {data.workbook.ancient_question}</p>
              <p><strong>阅读提示</strong> {data.workbook.ancient_hint}</p>
            </section>
            <section>
              <h3>经文脉络</h3>
              <p>{data.workbook.passage_summary}</p>
            </section>
            <section>
              <h3>查考与默想</h3>
              {(data.workbook.questions || []).map((q, i) => (
                <div key={i} className="devotional-q">
                  <p><strong>{i + 1}.</strong> {q.prompt}</p>
                  <textarea
                    className="devotional-input"
                    rows={3}
                    placeholder="用自己的话回答…"
                    value={draft.answers[i] || ''}
                    onChange={(e) => {
                      const answers = [...draft.answers];
                      answers[i] = e.target.value;
                      setDraft({ ...draft, answers, updatedAt: Date.now() });
                    }}
                  />
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setHintOpen((m) => ({ ...m, [i]: !m[i] }))}
                  >
                    {hintOpen[i] ? '收起默想提示' : '查看默想提示'}
                  </button>
                  {hintOpen[i] ? <p className="muted devotional-hint">{q.hint}</p> : null}
                </div>
              ))}
            </section>
            <section>
              <h3>立约脉络</h3>
              <p>{data.workbook.covenant_thread}</p>
            </section>
            <section>
              <h3>今日实践</h3>
              <div className="devotional-practices">
                {(data.workbook.practices || []).map((p, i) => (
                  <label key={i} className={`devotional-practice${draft.practiceIndex === i ? ' active' : ''}`}>
                    <input
                      type="radio"
                      name="practice"
                      checked={draft.practiceIndex === i}
                      onChange={() => setDraft({ ...draft, practiceIndex: i, updatedAt: Date.now() })}
                    />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
              <textarea
                className="devotional-input"
                rows={2}
                placeholder="我决定在 ____ 之前，向 ____ 做 ____。"
                value={draft.practiceNote}
                onChange={(e) => setDraft({ ...draft, practiceNote: e.target.value, updatedAt: Date.now() })}
              />
              {data.workbook.sc2_tags ? (
                <p className="muted" style={{ fontSize: 12 }}>2SC 关联 {data.workbook.sc2_tags}</p>
              ) : null}
            </section>
            <div className="devotional-prayer-box">
              <strong>今日祷告</strong>
              <p>{data.workbook.prayer}</p>
            </div>
          </article>
        )}
      </section>

      <section className="devotional-feed">
        <button
          type="button"
          className="devotional-feed-toggle"
          onClick={() => setFeedExpanded((v) => !v)}
        >
          <strong>同行动态</strong>
          <span className="muted">
            {data.day_checkins} 人已完成 · {feedExpanded ? '收起' : '查看'}
          </span>
        </button>
        {feedExpanded ? (
          feed.length === 0 ? (
            <p className="muted" style={{ marginTop: 10 }}>成为今天第一位留下回应的人。</p>
          ) : (
            <>
              {visibleFeed.map((item) => (
                <article key={item.id} className="devotional-feed-item card card-2">
                  <div className="devotional-feed-head">
                    <strong>{item.mine ? '我' : item.display_name}</strong>
                    <span className="devotional-feed-emoji">{item.emoji}</span>
                  </div>
                  {item.body ? <p>{item.body}</p> : null}
                  <div className="devotional-react-row">
                    {CHECKIN_EMOJI_OPTIONS.map((opt) => {
                      const count = item.reactions?.[opt.emoji]?.length || 0;
                      return (
                        <button
                          key={opt.emoji}
                          type="button"
                          className={`group-emoji-btn${count ? ' active' : ''}`}
                          onClick={() => void toggleReact(item.id, opt.emoji)}
                          title={opt.label}
                        >
                          {opt.emoji}{count ? ` ${count}` : ''}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="text-link"
                      style={{ fontSize: 12 }}
                      onClick={() => setCommentingId((id) => (id === item.id ? null : item.id))}
                    >
                      回应
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      style={{ fontSize: 12 }}
                      onClick={() =>
                        void api.reportDevotional('checkin', item.id, '不当内容').then(() => {
                          setErr('已收到举报，我们会尽快处理');
                        })
                      }
                    >
                      举报
                    </button>
                  </div>
                  {(item.comments || []).length > 0 ? (
                    <div className="devotional-comments">
                      {(item.comments || []).map((c) => (
                        <p key={c.id} className="devotional-comment">
                          <strong>{c.mine ? '我' : c.display_name}</strong> {c.body}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {commentingId === item.id ? (
                    <div className="devotional-comment-compose">
                      <input
                        value={commentDraft[item.id] || ''}
                        onChange={(e) => setCommentDraft((m) => ({ ...m, [item.id]: e.target.value }))}
                        placeholder="写一句鼓励…"
                        maxLength={500}
                      />
                      <button type="button" className="text-link" onClick={() => void sendComment(item.id)}>
                        发送
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              {!feedShowAll && feed.length > 3 ? (
                <button type="button" className="text-link" onClick={() => setFeedShowAll(true)}>
                  查看全部 {feed.length} 条同行回应
                </button>
              ) : null}
            </>
          )
        ) : null}
      </section>

      <div className="devotional-bottom-bar">
        <button type="button" className="btn" onClick={onBottomPrimary}>
          {bottomLabel}
        </button>
        {data.my_checkin && tab === 'workbook' && nextDay ? (
          <button type="button" className="btn secondary" onClick={() => changeDay(nextDay)}>
            继续第 {nextDay} 次
          </button>
        ) : null}
      </div>

      {pickerOpen && (
        <div className="sheet-backdrop" onClick={() => setPickerOpen(false)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <div className="half-sheet-grab" aria-hidden />
            <strong>选择第几次</strong>
            <p className="muted" style={{ fontSize: 13 }}>可自由补读，不强制顺序</p>
            {nextDay ? (
              <button
                type="button"
                className="btn"
                style={{ width: '100%', marginTop: 10 }}
                onClick={() => changeDay(nextDay)}
              >
                继续第 {nextDay} 次
              </button>
            ) : null}
            <div className="devotional-day-grid">
              {(data.sessions || []).map((s) => {
                const done = checked.has(s.day);
                const current = s.day === day;
                return (
                  <button
                    key={s.day}
                    type="button"
                    className={`devotional-day-cell${done ? ' done' : ''}${current ? ' current' : ''}`}
                    onClick={() => changeDay(s.day)}
                  >
                    <span>
                      {s.day}
                      {done ? ' ✓' : ''}
                    </span>
                    <small>{s.title}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {checkinOpen && (
        <div className="sheet-backdrop" onClick={() => setCheckinOpen(false)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <div className="half-sheet-grab" aria-hidden />
            <strong>{data.my_checkin ? '更新打卡' : '完成本次灵修'}</strong>
            <p className="muted" style={{ fontSize: 13 }}>
              第{day}次 · {data.book_name}第{data.chapter}章
            </p>
            <div className="devotional-emoji-grid">
              {CHECKIN_EMOJI_OPTIONS.map((opt) => (
                <button
                  key={opt.emoji}
                  type="button"
                  className={`devotional-emoji-option${checkinEmoji === opt.emoji ? ' active' : ''}`}
                  onClick={() => setCheckinEmoji(opt.emoji)}
                >
                  <span>{opt.emoji}</span>
                  <small>{opt.label}</small>
                </button>
              ))}
            </div>
            <textarea
              className="devotional-input"
              rows={3}
              maxLength={120}
              placeholder="一句收获或祷告（可选）"
              value={checkinBody}
              onChange={(e) => setCheckinBody(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={busy}
              style={{ width: '100%', marginTop: 12 }}
              onClick={() => void submitCheckin()}
            >
              {busy ? '发布中…' : '发布打卡'}
            </button>
          </div>
        </div>
      )}

      {successOpen && data.my_checkin && (
        <div className="sheet-backdrop" onClick={() => setSuccessOpen(false)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <div className="half-sheet-grab" aria-hidden />
            <strong>第{day}次已完成</strong>
            <p className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              这是你完成的第 {data.my_days} 次
              {draft.practiceIndex != null && data.workbook.practices?.[draft.practiceIndex]
                ? ` · 今日实践：${data.workbook.practices[draft.practiceIndex]}`
                : ''}
            </p>
            {nextDay ? (
              <button
                type="button"
                className="btn"
                style={{ width: '100%', marginTop: 14 }}
                onClick={() => {
                  setSuccessOpen(false);
                  changeDay(nextDay);
                }}
              >
                继续第 {nextDay} 次
              </button>
            ) : null}
            <button
              type="button"
              className="btn secondary"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => setSuccessOpen(false)}
            >
              留在这一次
            </button>
          </div>
        </div>
      )}

      {data.copyright_note ? (
        <p className="muted" style={{ fontSize: 11, marginTop: 24, marginBottom: 88 }}>
          {data.attribution} · {data.copyright_note}
        </p>
      ) : null}
    </main>
  );
}

export { formatParticipants, GENESIS_50_SERIES_ID, tabLabel };
