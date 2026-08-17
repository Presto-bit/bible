'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { api, type OpsCampaignDetail } from '@/lib/api';
import { shareCampaignLink, formatCountdown } from '@/lib/campaign_ops';
import { openCampaignHref, resolvePrimaryCta } from '@/lib/campaign_nav';
import { CampaignLandingBlocks } from '@/components/campaigns/CampaignLandingBlocks';
import { ensureLandingBlocks, normalizeBlocks } from '@/lib/campaign_blocks';
import { resolveCampaignCoverUrl } from '@/lib/daily_verse_wallpaper';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { isFlutterH5Host, leaveFlutterH5IfNativeHref, peiaiOpenNative } from '@/lib/flutter_h5_bridge';

export default function CampaignViewInner() {
  const params = useParams();
  const search = useSearchParams();
  useEdgeSwipeBack({ href: '/' });
  const id = String(params?.id || '');
  const preview = search.get('preview') === '1';
  const dayParam = search.get('day');
  const [camp, setCamp] = useState<OpsCampaignDetail | null>(null);
  const [denied, setDenied] = useState<{ message: string; name?: string; tag?: string } | null>(null);
  const [day, setDay] = useState(1);
  const [comment, setComment] = useState('');
  const [prayer, setPrayer] = useState('');
  const [question, setQuestion] = useState('');
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [countdown, setCountdown] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = useCallback((msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint(null), 2400);
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    setDenied(null);
    try {
      const res = await api.getCampaign(id, preview);
      if (res.denied || !res.campaign) {
        setCamp(null);
        setDenied({
          message: res.message || '此活动仅对指定群开放',
          name: res.teaser?.name,
          tag: res.teaser?.tag,
        });
        return;
      }
      const campaign = res.campaign;
      setCamp(campaign);
      const days = campaign.landing?.days || [];
      if (dayParam && days.some((d) => d.day === Number(dayParam))) {
        setDay(Number(dayParam));
      } else if (days.length) {
        const unread = days.find(
          (d) => !d.locked && !(campaign.readDays || []).includes(d.day),
        );
        setDay(unread?.day || days.find((d) => !d.locked)?.day || days[0].day || 1);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '无法打开活动');
    }
  }, [id, preview, dayParam]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  useEffect(() => {
    const target =
      camp?.landing?.schedule?.startsAt ||
      (camp?.landing?.features?.countdown ? camp.startAt : undefined);
    if (!target || !(camp?.landing?.features?.countdown || camp?.templateId === 'gathering' || camp?.templateId === 'season')) {
      setCountdown(null);
      return;
    }
    const tick = () => setCountdown(formatCountdown(target));
    tick();
    const t = window.setInterval(tick, 30000);
    return () => window.clearInterval(t);
  }, [camp]);

  const currentDay = useMemo(() => {
    const days = camp?.landing?.days || [];
    return days.find((d) => d.day === day) || days[0];
  }, [camp, day]);

  const features = camp?.landing?.features || {};
  const closed = Boolean(camp?.interactionClosed);

  const onLike = async () => {
    setBusy(true);
    try {
      const res = await api.toggleCampaignLike(id);
      setCamp((prev) =>
        prev ? { ...prev, liked: res.liked, likesCount: res.likesCount } : prev,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const onRsvp = async (status: 'yes' | 'no' | 'maybe') => {
    if (closed) return;
    setBusy(true);
    try {
      const res = await api.upsertCampaignRsvp(id, status);
      setCamp((prev) =>
        prev ? { ...prev, myRsvp: res.myRsvp, rsvpStats: res.rsvpStats } : prev,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const onComment = async () => {
    if (!comment.trim() || closed) return;
    setBusy(true);
    try {
      const { comment: c } = await api.addCampaignComment(
        id,
        comment.trim(),
        currentDay?.locked ? undefined : currentDay?.day,
      );
      setCamp((prev) =>
        prev ? { ...prev, comments: [c, ...(prev.comments || [])] } : prev,
      );
      setComment('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '评论失败');
    } finally {
      setBusy(false);
    }
  };

  const onPrayer = async () => {
    if (!prayer.trim() || closed) return;
    setBusy(true);
    try {
      await api.addCampaignPrayer(id, prayer.trim());
      setPrayer('');
      flash('已提交，意向默认仅管理员可见');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusy(false);
    }
  };

  const onMarkRead = async () => {
    if (!currentDay?.day || currentDay.locked) return;
    setBusy(true);
    try {
      const res = await api.markCampaignDayRead(id, currentDay.day);
      setCamp((prev) => (prev ? { ...prev, readDays: res.readDays } : prev));
      flash(camp?.templateId === 'memory' ? '已标记记住' : '今日已读');
      const days = camp?.landing?.days || [];
      const next = days.find(
        (d) => d.day > currentDay.day && !d.locked && !(res.readDays || []).includes(d.day),
      );
      if (next) setDay(next.day);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '标记失败');
    } finally {
      setBusy(false);
    }
  };

  const onShare = async () => {
    if (!camp) return;
    const result = await shareCampaignLink({
      campaignId: id,
      title: camp.landing?.title || camp.name,
      body: camp.subtitle || camp.landing?.body,
      day: currentDay?.day,
    });
    if (result === 'cancelled') return;
    flash(
      result === 'shared'
        ? '已调起分享'
        : result === 'copied'
          ? '链接已复制'
          : '分享失败',
    );
  };

  const onSignup = async (slotId: string) => {
    if (closed) return;
    setBusy(true);
    try {
      const res = await api.toggleCampaignSignup(id, slotId);
      setCamp((prev) => {
        if (!prev) return prev;
        const slots = (prev.slots || []).map((s) =>
          s.id === slotId
            ? { ...s, taken: res.taken, remaining: res.remaining }
            : s,
        );
        return { ...prev, slots, mySlots: res.mySlots };
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '报名失败');
    } finally {
      setBusy(false);
    }
  };

  const onAsk = async () => {
    if (!question.trim() || closed) return;
    setBusy(true);
    try {
      const { question: q } = await api.askCampaignQuestion(id, question.trim());
      setCamp((prev) =>
        prev ? { ...prev, questions: [q, ...(prev.questions || [])] } : prev,
      );
      setQuestion('');
      flash('已提交提问，仅你与活动创建者可见');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusy(false);
    }
  };

  const onAnswer = async (qid: string) => {
    const text = (answerDraft[qid] || '').trim();
    if (!text) return;
    setBusy(true);
    try {
      await api.answerCampaignQuestion(id, qid, text);
      setCamp((prev) =>
        prev
          ? {
              ...prev,
              questions: (prev.questions || []).map((q) =>
                q.id === qid ? { ...q, answer: text, answeredAt: new Date().toISOString() } : q,
              ),
            }
          : prev,
      );
      setAnswerDraft((d) => ({ ...d, [qid]: '' }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '回复失败');
    } finally {
      setBusy(false);
    }
  };

  if (denied) {
    return (
      <main className="container" style={{ paddingBottom: 48 }}>
        <span className="pill">{denied.tag || '活动'}</span>
        <h1 style={{ fontSize: 22 }}>{denied.name || '活动'}</h1>
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <p style={{ marginTop: 0 }}>{denied.message}</p>
          <p className="muted" style={{ fontSize: 13 }}>
            正文不会向非成员展示。请登录后确认你已加入对应共读群，或联系群主邀请。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link
              href="/discover"
              className="btn btn-primary"
              onClick={(e) => {
                if (!isFlutterH5Host()) return;
                e.preventDefault();
                peiaiOpenNative({ type: 'open_path', path: '/discover' });
                peiaiOpenNative({ type: 'close_h5' });
              }}
            >
              去发现找群
            </Link>
            <Link
              href="/"
              className="btn"
              onClick={(e) => {
                if (leaveFlutterH5IfNativeHref('/')) e.preventDefault();
              }}
            >
              回首页
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (err && !camp) {
    return (
      <main className="container">
        <p style={{ color: 'var(--danger, #b00)' }}>{err}</p>
        <Link
          href="/"
          onClick={(e) => {
            if (leaveFlutterH5IfNativeHref('/')) e.preventDefault();
          }}
        >
          回首页
        </Link>
      </main>
    );
  }

  if (!camp) {
    return (
      <main className="container">
        <p className="muted">加载中…</p>
      </main>
    );
  }

  const schedule = camp.landing?.schedule;
  const days = camp.landing?.days || [];
  const readDays = new Set(camp.readDays || []);
  const unlockCap = camp.unlockedDayCap;
  const progressPct = days.length ? Math.round((readDays.size / days.length) * 100) : 0;
  const dayIndex = days.findIndex((d) => d.day === day);
  const prevDay = dayIndex > 0 ? days[dayIndex - 1] : null;
  const nextDay = dayIndex >= 0 && dayIndex < days.length - 1 ? days[dayIndex + 1] : null;
  const landingEnsured = ensureLandingBlocks(camp.landing || {}, camp.templateId || '');
  const blockTypes = new Set(normalizeBlocks(landingEnsured.blocks).map((b) => b.type));
  const cta = resolvePrimaryCta(camp.templateId || '', id, camp.landing?.primaryCta);
  const coverSrc = resolveCampaignCoverUrl(camp.coverUrl);

  const entriesSection =
    (camp.landing?.entries || []).filter((e) => (e.title || '').trim() && (e.href || '').trim())
      .length > 0 ? (
      <div style={{ display: 'grid', gap: 8 }}>
        <p className="section-label" style={{ margin: 0 }}>
          入口
        </p>
        {(camp.landing?.entries || [])
          .filter((e) => (e.title || '').trim() && (e.href || '').trim())
          .map((e) => (
            <button
              key={e.id || e.href}
              type="button"
              className="card ops-entry"
              onClick={() => openCampaignHref(e.href)}
            >
              <strong style={{ display: 'block' }}>{e.title}</strong>
              {e.sub ? (
                <span className="muted" style={{ fontSize: 13 }}>
                  {e.sub}
                </span>
              ) : null}
            </button>
          ))}
      </div>
    ) : null;

  const ctaSection = cta.label && cta.href ? (
    <button
      type="button"
      className="btn btn-primary"
      style={{ width: '100%' }}
      onClick={() => openCampaignHref(cta.href)}
    >
      {cta.label}
    </button>
  ) : null;

  const scheduleSection =
    schedule && (schedule.location || schedule.onlineNote || schedule.startsAt) ? (
      <div className="card" style={{ padding: 14 }}>
        <p className="section-label" style={{ marginTop: 0 }}>
          聚会信息
        </p>
        {countdown ? (
          <p style={{ margin: '4px 0', fontWeight: 650, fontSize: 16 }}>倒计时：{countdown}</p>
        ) : null}
        {schedule.startsAt ? (
          <p style={{ margin: '4px 0' }}>时间：{new Date(schedule.startsAt).toLocaleString()}</p>
        ) : null}
        {schedule.location ? <p style={{ margin: '4px 0' }}>地点：{schedule.location}</p> : null}
        {schedule.onlineNote ? <p style={{ margin: '4px 0' }}>{schedule.onlineNote}</p> : null}
      </div>
    ) : null;

  const slotsSection =
    (camp.slots || []).length > 0 ? (
      <div className="card" style={{ padding: 14 }}>
        <p className="section-label" style={{ marginTop: 0 }}>
          岗位报名
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {(camp.slots || []).map((s) => {
            const mine = (camp.mySlots || []).includes(s.id);
            const full = s.limit > 0 && s.taken >= s.limit;
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <strong>{s.title}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                    {s.taken}/{s.limit || '∞'}
                    {full && !mine ? ' · 已满' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || closed || (full && !mine)}
                  onClick={() => void onSignup(s.id)}
                >
                  {mine ? '取消报名' : '报名'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    ) : null;

  const daysSection =
    days.length > 0 ? (
      <div>
        <p className="section-label" style={{ marginBottom: 6 }}>
          {camp.templateId === 'memory' ? '背诵清单' : '日课'}
        </p>
        <div className="ops-day-chips" role="tablist" aria-label="选择天数">
          {days.map((d) => (
            <button
              key={d.day}
              type="button"
              role="tab"
              aria-selected={day === d.day}
              className={`ops-day-chip${day === d.day ? ' is-on' : ''}${readDays.has(d.day) ? ' is-done' : ''}${d.locked ? ' is-locked' : ''}`}
              onClick={() => setDay(d.day)}
            >
              {d.locked ? '·' : d.day}
            </button>
          ))}
        </div>
        {currentDay ? (
          <div className="card" style={{ padding: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: 18, letterSpacing: '-0.02em' }}>
              {currentDay.title || `第 ${currentDay.day} 天`}
            </h2>
            {currentDay.locked ? (
              <p className="muted">
                本日尚未解锁。按活动开始日起每天开放一天
                {typeof unlockCap === 'number' ? `（当前已到第 ${unlockCap} 天）` : ''}。
              </p>
            ) : (
              <>
                {currentDay.verseRef ? (
                  <p className="muted" style={{ fontSize: 13 }}>
                    经文：{currentDay.verseRef}{' '}
                    <Link href={`/reader?q=${encodeURIComponent(currentDay.verseRef)}`}>
                      打开圣经
                    </Link>
                  </p>
                ) : null}
                <div className="ops-view-body" style={{ marginTop: 8 }}>
                  {currentDay.body}
                </div>
                {currentDay.discussionHint ? (
                  <p className="ops-banner ops-banner-info" style={{ marginTop: 12 }}>
                    讨论：{currentDay.discussionHint}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 14, width: '100%' }}
                  disabled={busy || readDays.has(currentDay.day)}
                  onClick={() => void onMarkRead()}
                >
                  {readDays.has(currentDay.day)
                    ? camp.templateId === 'memory'
                      ? '已记住'
                      : '今日已读'
                    : camp.templateId === 'memory'
                      ? '标记已记住'
                      : '标记今日已读'}
                </button>
                <div className="ops-day-nav">
                  <button
                    type="button"
                    className="btn"
                    disabled={!prevDay}
                    onClick={() => prevDay && setDay(prevDay.day)}
                  >
                    上一天
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!nextDay}
                    onClick={() => nextDay && setDay(nextDay.day)}
                  >
                    下一天
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    ) : null;

  const questionsSection = features.questions ? (
    <div className="card" style={{ padding: 14 }}>
      <p className="section-label" style={{ marginTop: 0 }}>
        提问箱
      </p>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        提问仅你与活动创建者可见
      </p>
      <textarea
        className="input"
        rows={2}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="想问什么…"
        style={{ width: '100%' }}
        disabled={closed}
      />
      <button
        type="button"
        className="btn"
        style={{ marginTop: 8 }}
        disabled={busy || closed}
        onClick={() => void onAsk()}
      >
        提交提问
      </button>
      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        {(camp.questions || []).map((q) => (
          <div key={q.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <p style={{ margin: 0 }}>{q.body}</p>
            {q.answer ? (
              <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
                回复：{q.answer}
              </p>
            ) : camp.isCreator ? (
              <div style={{ marginTop: 6 }}>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="回复…"
                  value={answerDraft[q.id] || ''}
                  onChange={(e) => setAnswerDraft((d) => ({ ...d, [q.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 6 }}
                  disabled={busy}
                  onClick={() => void onAnswer(q.id)}
                >
                  回复
                </button>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 12 }}>
                等待回复
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const rsvpSection = features.rsvp ? (
    <div className="card" style={{ padding: 14 }}>
      <p className="section-label" style={{ marginTop: 0 }}>
        你会来吗？
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(
          [
            ['yes', '出席'],
            ['maybe', '未定'],
            ['no', '请假'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className="btn"
            disabled={busy || closed}
            style={{ opacity: camp.myRsvp === k ? 1 : 0.65 }}
            onClick={() => void onRsvp(k)}
          >
            {label}
            {camp.rsvpStats?.[k] ? ` · ${camp.rsvpStats[k]}` : ''}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const prayerSection = features.prayer ? (
    <div className="card" style={{ padding: 14 }}>
      <p className="section-label" style={{ marginTop: 0 }}>
        代祷意向
      </p>
      <textarea
        className="input"
        rows={3}
        value={prayer}
        onChange={(e) => setPrayer(e.target.value)}
        placeholder="写下你的代祷…"
        style={{ width: '100%' }}
        disabled={closed}
      />
      <button
        type="button"
        className="btn btn-primary"
        style={{ marginTop: 8 }}
        disabled={busy || closed}
        onClick={() => void onPrayer()}
      >
        提交
      </button>
      {camp.isCreator && (camp.prayers || []).length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ fontSize: 12 }}>
            仅创建者可见
          </p>
          {(camp.prayers || []).map((p) => (
            <p
              key={p.id}
              style={{ fontSize: 14, borderTop: '1px solid var(--line)', paddingTop: 8 }}
            >
              {p.body}
            </p>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          意向默认仅管理员可见
        </p>
      )}
    </div>
  ) : null;

  const likesRow = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {features.likes !== false ? (
        <button type="button" className="btn" disabled={busy} onClick={() => void onLike()}>
          {camp.liked ? '已赞' : '点赞'} · {camp.likesCount || 0}
        </button>
      ) : null}
      <Link
        href="/"
        className="btn"
        onClick={(e) => {
          if (leaveFlutterH5IfNativeHref('/')) e.preventDefault();
        }}
      >
        回首页
      </Link>
    </div>
  );

  const commentsSection = features.comments ? (
    <div>
      <p className="section-label">{camp.templateId === 'testify' ? '见证' : '讨论'}</p>
      <textarea
        className="input"
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={camp.templateId === 'testify' ? '写下短见证…' : '写一句回应…'}
        style={{ width: '100%' }}
        disabled={closed}
      />
      <button
        type="button"
        className="btn"
        style={{ marginTop: 8 }}
        disabled={busy || closed}
        onClick={() => void onComment()}
      >
        发送
      </button>
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {(camp.comments || []).map((c) => (
          <div key={c.id} className="card" style={{ padding: 10 }}>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {c.body}
            </p>
            <span className="muted" style={{ fontSize: 11 }}>
              {c.day ? `第 ${c.day} 天 · ` : ''}
              {c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const engageSection = (
    <div style={{ display: 'grid', gap: 12 }}>
      {questionsSection}
      {rsvpSection}
      {prayerSection}
      {likesRow}
      {commentsSection}
    </div>
  );

  return (
    <main className="container ops-page">
      {preview ? (
        <p className="ops-banner ops-banner-info">
          预览模式 · 非群成员打开链接只会看到范围说明，看不到正文
        </p>
      ) : null}
      {closed ? (
        <p className="ops-banner ops-banner-info">活动已结束 · 可只读回顾；报名/表态已关闭</p>
      ) : null}

      {coverSrc ? (
        <div className="ops-view-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverSrc} alt="" />
        </div>
      ) : null}

      <div className="ops-view-hero">
        <div className="section-row" style={{ marginTop: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="pill">{camp.tag || '活动'}</span>
              {closed ? <span className="ops-status ops-status-ended">已结束</span> : null}
            </div>
            <h1 className="ops-view-title">{camp.landing?.title || camp.name}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" className="btn" onClick={() => void onShare()}>
              分享
            </button>
          </div>
        </div>

        {days.length > 0 ? (
          <div className="ops-progress">
            <div className="ops-progress-track" aria-hidden>
              <div className="ops-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="ops-progress-label">
              已完成 {readDays.size}/{days.length}
              {features.dayUnlock === 'by_start' && typeof unlockCap === 'number'
                ? ` · 已解锁到第 ${unlockCap} 天`
                : ''}
            </span>
          </div>
        ) : null}
      </div>

      {camp.landing?.body && !(camp.landing?.blocks || []).length ? (
        <p className="ops-view-body">{camp.landing.body}</p>
      ) : null}

      <CampaignLandingBlocks
        landing={landingEnsured}
        templateId={camp.templateId}
        campaignId={id}
        mode="view"
        renderBlock={(block, fallback) => {
          if (block.type === 'entries') return entriesSection || fallback;
          if (block.type === 'cta') return ctaSection || fallback;
          if (block.type === 'schedule') return scheduleSection || fallback;
          if (block.type === 'slots') return slotsSection || fallback;
          if (block.type === 'days') return daysSection || fallback;
          if (block.type === 'engage') return engageSection;
          return fallback;
        }}
      />

      {err ? (
        <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>
          {err}
        </p>
      ) : null}

      {/* 无对应积木时的兜底（旧数据） */}
      {!blockTypes.has('entries') ? entriesSection : null}
      {!blockTypes.has('cta') ? (
        <div style={{ marginTop: 14 }}>{ctaSection}</div>
      ) : null}
      {!blockTypes.has('schedule') ? (
        <div style={{ marginTop: 14 }}>{scheduleSection}</div>
      ) : null}
      {!blockTypes.has('slots') ? (
        <div style={{ marginTop: 12 }}>{slotsSection}</div>
      ) : null}
      {!blockTypes.has('days') ? (
        <div style={{ marginTop: 18 }}>{daysSection}</div>
      ) : null}
      {!blockTypes.has('engage') ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          {questionsSection}
          {rsvpSection}
          {prayerSection}
          <div style={{ marginTop: 4 }}>{likesRow}</div>
          {commentsSection ? <div style={{ marginTop: 8 }}>{commentsSection}</div> : null}
        </div>
      ) : null}

      {hint ? (
        <div className="ops-toast" role="status">
          {hint}
        </div>
      ) : null}
    </main>
  );
}
