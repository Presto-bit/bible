'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  api,
  type DailyVerse,
  ensureAccountReady,
  getDisplayName,
} from '@/lib/api';
import {
  readLocalDailyVerseLike,
  writeLocalDailyVerseLike,
} from '@/lib/daily_verse_engagement';
import { assistantHref } from '@/lib/assistant_prefill';
import { currentSeasonalEvents } from '@/lib/gamification';
import { getPendingBookChallenge } from '@/lib/challenge_progress';
import { getActivePlan, getPlanDay } from '@/lib/plan_progress';
import { buildPlanReadingMeta, readerHref, resumeStepIndex } from '@/lib/plan_reading';
import { getPlanSession } from '@/lib/plan_session';
import { sessionProgress } from '@/lib/plan_steps';
import { buildReport, getLastRead, todayMinutes } from '@/lib/reading';
import { groupPlanProgressLabel } from '@/lib/group_plan';
import { nextReadingSuggestion } from '@/lib/suggestions';
import PlusMenu from '@/components/PlusMenu';

// 每日经文全屏背景图（按主题挑选；可在此配置更多背景）。
const VERSE_BG =
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80';

function buildRail(
  plan?: { title: string; sub: string; href: string },
  resume?: { title: string; sub: string; href: string },
  group?: { title: string; sub: string; href: string },
  prayer?: { title: string; sub: string; href: string },
  suggest?: { title: string; sub: string; href: string },
  assistant?: { title: string; sub: string; href: string },
) {
  const cards = [
    {
      tag: prayer ? '祷告' : '计划',
      reason: '今日计划',
      title: plan?.title ?? prayer?.title ?? '开始读经计划',
      sub: plan?.sub ?? prayer?.sub ?? '热门计划 · 个性定制',
      cta: plan || prayer ? '去读 ›' : '去看看 ›',
      href: plan?.href ?? prayer?.href ?? '/plans',
      accent: true,
    },
  ];
  if (group) {
    cards.push({
      tag: '小组',
      reason: '群待打卡',
      title: group.title,
      sub: group.sub,
      cta: '去打卡 ›',
      href: group.href,
      accent: false,
    });
  }
  if (suggest) {
    cards.push({
      tag: '推荐',
      reason: suggest.sub,
      title: suggest.title,
      sub: '智能推荐',
      cta: '去读 ›',
      href: suggest.href,
      accent: false,
    });
  }
  cards.push(
    {
      tag: '问答',
      reason: '每日问答',
      title: '今日 5 题',
      sub: '复习错题 · 巩固所学',
      cta: '开始 ›',
      href: '/challenge',
      accent: false,
    },
    {
      tag: '继续',
      reason: '你上次读到这里',
      title: resume?.title ?? '开始读经',
      sub: resume?.sub ?? '从圣经 Tab 继续',
      cta: '读 ›',
      href: resume?.href ?? '/reader',
      accent: false,
    },
    {
      tag: '小爱',
      reason: '基于今日经文',
      title: assistant?.title ?? '小爱想问你',
      sub: assistant?.sub ?? '「这段经文里，神的应许对你意味着什么？」',
      cta: '聊聊 ›',
      href: assistant?.href ?? '/assistant',
      accent: false,
    },
  );
  return cards;
}

export default function HomePageClient() {
  const [dv, setDv] = useState<DailyVerse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dvLoading, setDvLoading] = useState(true);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeErr, setLikeErr] = useState<string | null>(null);

  const loadDailyVerse = useCallback(() => {
    setDvLoading(true);
    setErr(null);
    void ensureAccountReady()
      .then(() => api.dailyVerse())
      .then((v) => {
        setDv(v);
        const day = v.day ?? 0;
        const localLiked = day ? readLocalDailyVerseLike(day) : null;
        const serverLiked = Boolean(v.liked);
        const mergedLiked = serverLiked || localLiked === true;
        setLiked(mergedLiked);
        if (day && mergedLiked) writeLocalDailyVerseLike(day, true);
        setLikeCount(v.likes_count ?? 0);
        setShareCount(v.shares_count ?? 0);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setDvLoading(false));
  }, []);

  useEffect(() => {
    loadDailyVerse();
  }, [loadDailyVerse]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadDailyVerse();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadDailyVerse]);

  useEffect(() => {
    const img = new Image();
    img.src = VERSE_BG;
  }, []);
  const [shared, setShared] = useState(false);
  const [readingSummary, setReadingSummary] = useState({ todayMin: 0, monthDays: 0 });
  const [page, setPage] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);

  const [verseFull, setVerseFull] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [pendingBook, setPendingBook] = useState<ReturnType<typeof getPendingBookChallenge>>(null);
  const [rail, setRail] = useState(() => buildRail());
  const [userName, setUserName] = useState('');
  const [groupSummary, setGroupSummary] = useState<{
    line: string;
    href: string;
  } | null>(null);
  const seasonal = currentSeasonalEvents();

  useEffect(() => {
    const refreshName = () => {
      setUserName(getDisplayName());
      const report = buildReport();
      setReadingSummary({ todayMin: todayMinutes(), monthDays: report.monthDays });
    };
    refreshName();
    window.addEventListener('focus', refreshName);
    return () => window.removeEventListener('focus', refreshName);
  }, []);

  const refreshRail = useCallback(async () => {
    setPendingBook(getPendingBookChallenge());
    const report = buildReport();
    setReadingSummary({ todayMin: todayMinutes(), monthDays: report.monthDays });
    let planCard: { title: string; sub: string; href: string } | undefined;
    let prayerCard: { title: string; sub: string; href: string } | undefined;
    const active = getActivePlan();
    if (active?.kind === 'prayer') {
      const day = getPlanDay(active.planId) || 1;
      prayerCard = {
        title: `${active.title} · 第 ${day} 天`,
        sub: '今日祷告',
        href: '/plans?tab=prayer',
      };
    } else if (active) {
      const day = getPlanDay(active.planId) || 1;
      const meta = await buildPlanReadingMeta(active, day);
      if (meta) {
        const sess = getPlanSession(active.planId, day) ?? meta.session;
        const fullMeta = { ...meta, session: sess };
        const idx = resumeStepIndex(fullMeta);
        const step = meta.steps[idx] ?? meta.steps[0];
        const p = sessionProgress(meta.steps, sess.stepsDone);
        planCard = {
          title: `${active.title} · 第 ${day} 天`,
          sub: `${step.label} · ${p.done}/${p.total} 段`,
          href: readerHref(fullMeta, idx),
        };
      }
    }
    let resumeCard: { title: string; sub: string; href: string } | undefined;
    const last = getLastRead();
    if (last) {
      try {
        const { books } = await api.books();
        const book = books.find((b) => b.id === last.bookId);
        const name = book?.name ?? last.bookId;
        resumeCard = {
          title: `${name} ${last.chapter}`,
          sub: '从上次继续',
          href: `/reader?book=${last.bookId}&chapter=${last.chapter}`,
        };
      } catch {
        resumeCard = {
          title: `第 ${last.chapter} 章`,
          sub: '从上次继续',
          href: `/reader?book=${last.bookId}&chapter=${last.chapter}`,
        };
      }
    }
    let groupCard: { title: string; sub: string; href: string } | undefined;
    let summaryLine: { line: string; href: string } | null = null;
    try {
      const [groupsRes, summary] = await Promise.all([
        api.myGroups(),
        api.discoverSummary(),
      ]);
      const groups = groupsRes.groups;
      const pending = groups.find((g) => !g.my_checked_in_today)
        ?? groups.find((g) => (g.open_tasks ?? 0) > 0);
      if (pending && (summary.groups_pending_checkin > 0 || summary.groups_pending_tasks > 0)) {
        const parts: string[] = [];
        if (!pending.my_checked_in_today) parts.push('待打卡');
        if ((pending.open_tasks ?? 0) > 0) parts.push(`${pending.open_tasks} 个任务`);
        if (pending.plan_id) {
          const planLine = groupPlanProgressLabel(pending);
          if (planLine) parts.push(planLine);
        }
        groupCard = {
          title: pending.name,
          sub: parts.join(' · ') || '共读群动态',
          href: `/discover/group/${pending.id}`,
        };
      }
      if (groups.length > 0) {
        const checked = groups.reduce((n, g) => n + (g.checked_in_today ?? 0), 0);
        const parts: string[] = [];
        if (summary.groups_pending_checkin > 0) {
          parts.push(`${summary.groups_pending_checkin} 个群待打卡`);
        }
        if (summary.groups_pending_tasks > 0) {
          parts.push(`${summary.groups_pending_tasks} 个群任务`);
        }
        if (summary.friends_checked_in_today > 0) {
          parts.push(`今天 ${summary.friends_checked_in_today} 位好友打卡`);
        }
        summaryLine = {
          line: parts.length > 0
            ? parts.join(' · ')
            : `${groups[0].name} · 今日 ${checked} 人已打卡`,
          href: pending ? `/discover/group/${pending.id}` : '/discover',
        };
      } else {
        summaryLine = { line: '去发现 · 创建或加入共读群', href: '/discover' };
      }
    } catch {
      summaryLine = { line: '去发现 · 加入共读打卡', href: '/discover' };
    }
    setGroupSummary(summaryLine);
    const suggest = nextReadingSuggestion();
    let assistantCard: { title: string; sub: string; href: string } | undefined;
    try {
      const dv = await api.dailyVerse();
      if (dv?.ref) {
        const q = '这段经文里，神的应许对你意味着什么？';
        assistantCard = {
          title: '小爱想问你',
          sub: `「${q}」`,
          href: assistantHref(dv.ref, { question: q, autoSend: true }),
        };
      }
    } catch {
      /* ignore */
    }
    setRail(buildRail(
      planCard,
      resumeCard,
      groupCard,
      prayerCard,
      suggest ? { title: suggest.title, sub: suggest.reason, href: suggest.href } : undefined,
      assistantCard,
    ));
  }, []);

  useEffect(() => {
    refreshRail();
  }, [refreshRail]);

  const onScroll = () => {
    const el = railRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / (el.clientWidth * 0.82));
    setPage(Math.max(0, Math.min(rail.length - 1, i)));
  };

  const openVerseFull = () => {
    const img = new Image();
    img.src = VERSE_BG;
    const show = () => setVerseFull(true);
    if (img.complete) {
      show();
    } else {
      img.onload = show;
      img.onerror = show;
    }
  };

  return (
    <main className="container">
      <header className="greet">
        <div className="greet-text">
          <span className="greet-prefix">早安</span>
          <span className="greet-name">
            <i className="greet-bar" />
            {userName}
          </span>
        </div>
        <div className="greet-actions">
          <a href="/search" aria-label="搜索" className="icon-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
          </a>
          <button
            ref={plusBtnRef}
            type="button"
            aria-label="添加"
            className="icon-btn icon-btn-fill"
            onClick={() => setPlusOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </header>

      {seasonal[0] && (
        <Link href={seasonal[0].href} className="card row-card seasonal-card" style={{ display: 'flex', marginBottom: 14 }}>
          <span className="pill pill-active">{seasonal[0].badge}</span>
          <span style={{ flex: 1 }}>
            <strong>{seasonal[0].title}</strong>
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>{seasonal[0].subtitle}</span>
          </span>
          <span className="muted">›</span>
        </Link>
      )}

      <div
        className="card card-3 card-tint hero-verse"
        role="button"
        tabIndex={0}
        onClick={openVerseFull}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openVerseFull(); }}
      >
        <div className="hero-scene" aria-hidden />
        <div className="hero-inner">
          <div className="hero-top">
            <span className="hero-kicker">每日经文</span>
            {dv?.theme ? <span className="muted">{dv.theme}系列</span> : null}
          </div>
          {dv?.ref ? <p className="hero-ref">{dv.ref}</p> : null}
          <p className="verse-text">
            {err
              ? '内容加载失败'
              : dv
                ? `「${dv.text}」`
                : dvLoading
                  ? '加载中…'
                  : '暂无经文'}
          </p>
          {err && (
            <button
              type="button"
              className="text-link"
              style={{ marginTop: 8, fontSize: 13 }}
              onClick={(e) => { e.stopPropagation(); loadDailyVerse(); }}
            >
              点击重试
            </button>
          )}
          <div className="hero-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`hero-like${liked ? ' hero-like-active' : ''}`}
              disabled={likeBusy}
              aria-pressed={liked}
              onClick={async () => {
                if (likeBusy) return;
                const prevLiked = liked;
                const prevCount = likeCount;
                setLikeBusy(true);
                setLikeErr(null);
                setLiked(!prevLiked);
                setLikeCount(Math.max(0, prevCount + (prevLiked ? -1 : 1)));
                try {
                  const verseDay = dv?.day;
                  const r = await api.toggleDailyVerseLike(verseDay);
                  setLiked(Boolean(r.liked));
                  setLikeCount(r.likes_count ?? prevCount);
                  if (verseDay != null) writeLocalDailyVerseLike(verseDay, Boolean(r.liked));
                } catch (e) {
                  setLiked(prevLiked);
                  setLikeCount(prevCount);
                  const msg = e instanceof Error ? e.message : String(e);
                  setLikeErr(msg.includes('503') || msg.includes('暂不可用')
                    ? '点赞服务未就绪，请稍后在设置中清除缓存或联系管理员执行数据库迁移'
                    : `点赞失败：${msg}`);
                } finally {
                  setLikeBusy(false);
                }
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                <path d="M12 21s-7-4.6-9.3-8.4C1 9.6 2.5 6 6 6c2 0 3.2 1.2 4 2.3C10.8 7.2 12 6 14 6c3.5 0 5 3.6 3.3 6.6C19 16.4 12 21 12 21z" />
              </svg>
              <span>{likeCount.toLocaleString()} 人点赞</span>
            </button>
            {likeErr && (
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }} role="alert">{likeErr}</p>
            )}
            <button
              type="button"
              className={`hero-share ${shared ? 'hero-share-active' : ''}`}
              onClick={async () => {
                setShared(true);
                try {
                  const r = await api.recordDailyVerseShare();
                  setShareCount(r.shares_count);
                } catch {
                  /* ignore */
                }
              }}
            >
              {shared ? `已分享 · ${shareCount}` : '分享 / 壁纸'}
            </button>
          </div>
        </div>
      </div>

      <div className="rail home-rail" ref={railRef} onScroll={onScroll} style={{ marginTop: 18 }}>
        {rail.map((c, i) => (
          <a
            key={i}
            href={c.href}
            className={`rail-card card card-2 ${c.accent ? 'card-tint card-accent' : ''}`}
          >
            <div className="rail-head">
              <span className={`pill ${c.accent ? 'pill-active' : ''}`}>{c.tag}</span>
              <span className="muted rail-reason">{c.reason}</span>
            </div>
            <div className="rail-title">{c.title}</div>
            <div className="rail-foot">
              <span className="rail-sub">{c.sub}</span>
              <span className="rail-cta">{c.cta}</span>
            </div>
          </a>
        ))}
      </div>
      <div className="dots">
        {rail.map((_, i) => (
          <span key={i} className={i === page ? 'dot dot-active' : 'dot'} />
        ))}
      </div>

      <a href="/profile" className="card row-card" style={{ display: 'flex', marginTop: 14 }}>
        <span>
          今日 {readingSummary.todayMin} 分钟 · 本月已读 {readingSummary.monthDays} 天
        </span>
        <span className="muted">›</span>
      </a>

      <a href={groupSummary?.href ?? '/discover'} className="card row-card" style={{ display: 'flex', marginTop: 14 }}>
        <span className="pill">小组</span>
        <span style={{ flex: 1 }}>{groupSummary?.line ?? '去发现 · 加入共读打卡'}</span>
        <span className="muted">去发现 ›</span>
      </a>

      <p className="section-label">成长与回忆</p>
      {pendingBook && (
        <Link href="/challenge" className="card card-2 card-tint row-card challenge-nudge" style={{ display: 'flex', marginBottom: 10 }}>
          <span className="pill pill-active">巩固挑战</span>
          <span style={{ flex: 1, fontWeight: 600 }}>读完《{pendingBook.bookName}》了，来一关知识挑战？</span>
          <span className="rail-cta">去闯关 ›</span>
        </Link>
      )}
      <a href="/reader" className="card card-2 card-tint card-accent row-card" style={{ display: 'flex' }}>
        <span className="pill pill-active">继续读经</span>
        <span style={{ flex: 1, fontWeight: 600 }}>
          {getLastRead()
            ? `上次读到第 ${getLastRead()!.chapter} 章`
            : '打开圣经，开始今日阅读'}
        </span>
        <span className="rail-cta">去读 ›</span>
      </a>
      <a href="/report" className="card row-card" style={{ display: 'flex', marginTop: 10 }}>
        <span className="pill">回顾</span>
        <span style={{ flex: 1 }}>
          {new Date().getMonth() + 1} 月回顾 · 已读 {readingSummary.monthDays} 天
        </span>
        <span className="muted">读经回顾 ›</span>
      </a>

      {verseFull && (
        <div
          className="verse-full"
          onClick={() => setVerseFull(false)}
        >
          <img src={VERSE_BG} alt="" className="verse-full-bg" decoding="sync" fetchPriority="high" />
          <div className="verse-full-scrim" />
          <div className="verse-full-glow" aria-hidden />
          <button type="button" className="verse-full-close" aria-label="关闭" onClick={() => setVerseFull(false)}>
            ✕
          </button>
          <div className="verse-full-inner" onClick={(e) => e.stopPropagation()}>
            <p className="verse-full-kicker">每日经文</p>
            <div className="verse-full-ornament" aria-hidden>✦</div>
            {dv?.ref && <p className="verse-full-ref">{dv.ref}</p>}
            <p className="verse-full-text">{dv ? dv.text : '加载中…'}</p>
            {dv?.theme && <p className="verse-full-theme">{dv.theme}</p>}
          </div>
        </div>
      )}

      <PlusMenu anchorRef={plusBtnRef} open={plusOpen} onClose={() => setPlusOpen(false)} />
    </main>
  );
}
