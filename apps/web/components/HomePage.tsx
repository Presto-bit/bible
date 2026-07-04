'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  api,
  type DailyDevotional,
  type DailyVerse,
  ensureAccountReady,
  getDisplayName,
} from '@/lib/api';
import DailyVerseWallpaper from '@/components/DailyVerseWallpaper';
import { DailyDevotionalCard } from '@/components/home/DailyDevotionalCard';
import { dailyVerseWallpaperUrl } from '@/lib/daily_verse_wallpaper';
import { writeLocalDailyVerseLike, readLocalDailyVerseLike } from '@/lib/daily_verse_engagement';
import { assistantHref } from '@/lib/assistant_prefill';
import { currentSeasonalEvents } from '@/lib/gamification';
import { getPendingBookChallenge } from '@/lib/challenge_progress';
import { getActivePlan, getPlanDay } from '@/lib/plan_progress';
import { buildPlanReadingMeta, readerHref, resumeStepIndex } from '@/lib/plan_reading';
import { getPlanSession } from '@/lib/plan_session';
import { sessionProgress } from '@/lib/plan_steps';
import { buildReport, getLastRead, todayMinutes } from '@/lib/reading';
import { nextReadingSuggestion } from '@/lib/suggestions';
import PlusMenu from '@/components/PlusMenu';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import { listAllThoughts } from '@/lib/reader_thoughts';
import { listNotes } from '@/lib/notes';
import { buildHomeRail, heroThemeClass, type RailCard } from '@/lib/home_rail';
import { HomeRail } from '@/components/home/HomeRail';
import { bookIdToChineseName } from '@/lib/ref_label';

export default function HomePageClient() {
  const [dv, setDv] = useState<DailyVerse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dvLoading, setDvLoading] = useState(true);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeErr, setLikeErr] = useState<string | null>(null);
  const [verseFull, setVerseFull] = useState(false);
  const [devotional, setDevotional] = useState<DailyDevotional | null>(null);
  const [devotionalLoading, setDevotionalLoading] = useState(true);
  const [heroIllustration, setHeroIllustration] = useState<string | null>(null);

  const loadDailyVerse = useCallback(() => {
    setDvLoading(true);
    setErr(null);
    void ensureAccountReady()
      .then(() => api.dailyVerse())
      .then(async (v) => {
        const day = v.day ?? 0;
        // 以服务端为准；本地缓存仅作离线兜底（服务端未返回 liked 时）
        const likedVal =
          typeof v.liked === 'boolean'
            ? v.liked
            : (day > 0 ? readLocalDailyVerseLike(day) : null) ?? false;
        const countVal = v.likes_count ?? 0;
        setDv(v);
        setLiked(likedVal);
        setLikeCount(countVal);
        if (day) writeLocalDailyVerseLike(day, likedVal);
      })
      .catch((e) => setErr(errorMessage(e, '内容加载失败')))
      .finally(() => setDvLoading(false));
  }, []);

  useEffect(() => {
    loadDailyVerse();
    setDevotionalLoading(true);
    void api
      .dailyDevotional()
      .then(setDevotional)
      .catch(() => setDevotional(null))
      .finally(() => setDevotionalLoading(false));
  }, [loadDailyVerse]);

  useEffect(() => {
    // 每日经文直接铺风景图（按 day 轮换）
    setHeroIllustration(dailyVerseWallpaperUrl(dv?.day ?? 1));
  }, [dv?.day]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') loadDailyVerse();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [loadDailyVerse]);

  const [readingSummary, setReadingSummary] = useState({ todayMin: 0, monthDays: 0 });
  const plusBtnRef = useRef<HTMLButtonElement>(null);

  const [plusOpen, setPlusOpen] = useState(false);
  const [pendingBook, setPendingBook] = useState<ReturnType<typeof getPendingBookChallenge>>(null);
  const [railMain, setRailMain] = useState<RailCard[]>([]);
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
        title: `第 ${day} 天`,
        sub: active.title,
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
          title: step.label,
          sub: `${active.title} · 第 ${day} 天 · ${p.done}/${p.total} 段`,
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
          title: `${name} 第 ${last.chapter} 章`,
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
    let groupCard: {
      title: string;
      sub: string;
      href: string;
      statPct?: number;
      statLabel?: string;
    } | undefined;
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
        const members = pending.members || 1;
        const checked = pending.checked_in_today ?? 0;
        const actionResult = !pending.my_checked_in_today
          ? '今日待打卡'
          : (pending.open_tasks ?? 0) > 0
            ? `${pending.open_tasks} 个任务`
            : '今日已打卡';
        groupCard = {
          title: actionResult,
          sub: pending.name,
          href: `/discover/group/${pending.id}?focus=checkin`,
          statPct: members > 0 ? Math.round((checked / members) * 100) : 0,
          statLabel: `${checked}/${members}`,
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
          title: dv.ref,
          sub: '小爱想和你聊聊今日经文',
          href: assistantHref(dv.ref, {
            question: q,
            autoSend: true,
            surface: 'home_prefill',
          }),
        };
      }
    } catch {
      /* ignore */
    }
    const thoughtN = listAllThoughts().length;
    const noteN = listNotes().length;
    const memCount = thoughtN + noteN;
    const notesCard = {
      title: memCount > 0 ? `${memCount} 条记录` : '经文记忆',
      sub: '想法 · 收藏 · 划线',
      href: '/notes',
      count: memCount,
    };
    const pendingBookLocal = getPendingBookChallenge();
    const { main } = buildHomeRail({
      plan: planCard,
      resume: resumeCard,
      group: groupCard,
      prayer: prayerCard,
      suggest: suggest ? { title: suggest.title, sub: suggest.reason, href: suggest.href } : undefined,
      assistant: assistantCard,
      notes: notesCard,
      challenge: pendingBookLocal
        ? {
            title: `《${pendingBookLocal.bookName}》`,
            sub: '巩固问答 · 复习错题',
            href: '/challenge',
          }
        : undefined,
    });
    setRailMain(main);
  }, []);

  useEffect(() => {
    refreshRail();
  }, [refreshRail]);

  const lastRead = getLastRead();

  const openVerseWallpaper = () => {
    if (!dv?.text) return;
    setVerseFull(true);
  };

  const toggleLike = useCallback(async () => {
    if (likeBusy || !dv?.day) return;
    const verseDay = dv.day;
    const prevLiked = liked;
    const prevCount = likeCount;
    const nextLiked = !prevLiked;
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));
    setLikeBusy(true);
    setLikeErr(null);
    setLiked(nextLiked);
    setLikeCount(nextCount);
    writeLocalDailyVerseLike(verseDay, nextLiked);
    try {
      const r = await api.toggleDailyVerseLike(verseDay);
      // 以 toggle 响应为准；若字段缺失则保留乐观更新
      const syncedLiked = typeof r.liked === 'boolean' ? r.liked : nextLiked;
      const syncedCount =
        typeof r.likes_count === 'number' ? r.likes_count : nextCount;
      setLiked(syncedLiked);
      setLikeCount(syncedCount);
      writeLocalDailyVerseLike(verseDay, syncedLiked);
    } catch (e) {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      writeLocalDailyVerseLike(verseDay, prevLiked);
      setLikeErr(errorMessage(e, '暂时无法点赞，请稍后再试'));
    } finally {
      setLikeBusy(false);
    }
  }, [likeBusy, dv, liked, likeCount]);

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
        <Link href={seasonal[0].href} className="card row-card seasonal-card seasonal-card-pulse" style={{ display: 'flex', marginBottom: 14 }}>
          <span className="pill pill-active">{seasonal[0].badge}</span>
          <span style={{ flex: 1 }}>
            <strong>{seasonal[0].title}</strong>
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>{seasonal[0].subtitle}</span>
          </span>
          <span className="muted">›</span>
        </Link>
      )}

      <div
        className={`card card-3 hero-verse hero-verse-has-art ${heroThemeClass(dv?.theme)}`}
        role="button"
        tabIndex={dv?.text ? 0 : -1}
        aria-label={dv?.ref ? `欣赏 ${dv.ref}` : '每日经文'}
        onClick={openVerseWallpaper}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          openVerseWallpaper();
        }}
      >
        <div
          className={`hero-scene${heroIllustration ? ' hero-scene-has-art' : ''}`}
          aria-hidden
          style={
            heroIllustration
              ? {
                  backgroundImage: `url(${heroIllustration})`,
                }
              : undefined
          }
        />
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
              disabled={likeBusy || !dv?.day}
              aria-pressed={liked}
              aria-label={liked ? '取消点赞' : '点赞'}
              onClick={async (e) => {
                e.stopPropagation();
                await toggleLike();
              }}
            >
              {liked ? (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="hero-like-icon">
                  <path
                    fill="currentColor"
                    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                  />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="hero-like-icon"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              )}
              <span>{likeCount.toLocaleString()} 人点赞</span>
            </button>
            {likeErr && (
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }} role="alert">{likeErr}</p>
            )}
          </div>
        </div>
      </div>

      <DailyDevotionalCard data={devotional} loading={devotionalLoading} />

      <div style={{ marginTop: 18 }}>
        <HomeRail cards={railMain} />
      </div>

      <a href="/profile" className="card-row home-reading-summary text-stat" style={{ display: 'flex', marginTop: 14 }}>
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
          <span style={{ flex: 1, fontWeight: 600 }}>读完《{pendingBook.bookName}》了，来做每日问答？</span>
          <span className="rail-cta">去闯关 ›</span>
        </Link>
      )}
      <a href="/reader" className="card card-2 card-tint card-accent row-card" style={{ display: 'flex' }}>
        <span className="pill pill-active">继续读经</span>
        <span style={{ flex: 1, fontWeight: 600 }}>
          {lastRead
            ? `上次读到 ${bookIdToChineseName(lastRead.bookId)} 第 ${lastRead.chapter} 章`
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

      <PlusMenu anchorRef={plusBtnRef} open={plusOpen} onClose={() => setPlusOpen(false)} />

      {verseFull && dv ? (
        <DailyVerseWallpaper
          dv={dv}
          backgroundUrl={heroIllustration ?? dailyVerseWallpaperUrl(dv.day)}
          onClose={() => setVerseFull(false)}
        />
      ) : null}
    </main>
  );
}
