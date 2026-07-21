'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  type DailyVerse,
  ensureAccountReady,
  getDisplayName,
} from '@/lib/api';
import DailyVerseWallpaper from '@/components/DailyVerseWallpaper';
import { dailyVerseWallpaperUrl } from '@/lib/daily_verse_wallpaper';
import { writeLocalDailyVerseLike, readLocalDailyVerseLike } from '@/lib/daily_verse_engagement';
import { assistantHref } from '@/lib/assistant_prefill';
import { currentSeasonalEvents } from '@/lib/gamification';
import { getPendingBookChallenge } from '@/lib/challenge_progress';
import { getActivePlan, getPlanDay } from '@/lib/plan_progress';
import { prayerTodayHref } from '@/lib/plan_today_href';
import { buildPlanReadingMeta, readerHref, resumeStepIndex } from '@/lib/plan_reading';
import { getPlanSession } from '@/lib/plan_session';
import { sessionProgress } from '@/lib/plan_steps';
import { buildReport, getLastRead, todayMinutes } from '@/lib/reading';
import { nextReadingSuggestion } from '@/lib/suggestions';
import PlusMenu from '@/components/PlusMenu';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import { listAllThoughts } from '@/lib/reader_thoughts';
import { buildHomeRail, heroThemeClass, type RailCard } from '@/lib/home_rail';
import { bookIdFromReaderHref } from '@/lib/book_cover';
import { HomeRail } from '@/components/home/HomeRail';
import { HomeGreetStreak } from '@/components/home/HomeGreetStreak';
import { HomeHeroCarousel } from '@/components/home/HomeHeroCarousel';
import { buildHomeGroupRailInput } from '@/lib/home_social_line';
import {
  type HeroBCampaign,
  preloadHeroBCampaignImage,
  readCachedHeroBCampaign,
  writeCachedHeroBCampaign,
} from '@/lib/hero_b_campaign';
import { consumeHeroReturnToVerse } from '@/lib/hero_b_nav';
import { useTabKeepAlive } from '@/components/shell/TabKeepAliveContext';
import { buildHomeGrowthCards, type HomeGrowthCard } from '@/lib/home_growth_cards';
import { HomeGrowthStack } from '@/components/home/HomeGrowthStack';
import { readCachedDailyVerse, writeCachedDailyVerse } from '@/lib/daily_verse_cache';
import { loadBooksJson, seededBooks } from '@/lib/bible_local';
import { bookIdToChineseName } from '@/lib/ref_label';
import { timedPerf } from '@/lib/perf_rum';
import { watchChinaDayChange } from '@/lib/daily_clock';
import { subscribeLocalDataChanged } from '@/lib/local_data_events';
import { getSyncState, subscribeSyncState } from '@/lib/sync_status';
import { navigateAppHref } from '@/lib/pwa_tab_nav';
import { initPcWheelPassthrough } from '@/lib/pc_wheel_passthrough';
import { markHomeBootstrapReady } from '@/lib/offline_bootstrap';
import HomeOnboardingBanner from '@/components/home/HomeOnboardingBanner';
import { fetchAdminEligible } from '@/lib/admin_rag';
import { formatParticipants, tabLabel } from '@/lib/devotional_local';

/** 与 Mobile 首页一致的时段问候（更细分） */
function timeOfDayGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return '夜深了';
  if (hour < 8) return '清晨好';
  if (hour < 11) return '上午好';
  if (hour < 13) return '中午好';
  if (hour < 17) return '下午好';
  if (hour < 19) return '傍晚好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}

export default function HomePageClient({ paneActive = true }: { paneActive?: boolean }) {
  const [dv, setDv] = useState<DailyVerse | null>(() => readCachedDailyVerse());
  const [err, setErr] = useState<string | null>(null);
  const [dvLoading, setDvLoading] = useState(() => !readCachedDailyVerse());

  const [liked, setLiked] = useState(() => {
    const cached = readCachedDailyVerse();
    if (typeof cached?.liked === 'boolean') return cached.liked;
    if (cached?.day) return readLocalDailyVerseLike(cached.day) ?? false;
    return false;
  });
  const [likeCount, setLikeCount] = useState(() => readCachedDailyVerse()?.likes_count ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeErr, setLikeErr] = useState<string | null>(null);
  const likeBusyRef = useRef(false);
  const likedRef = useRef(false);
  const likeCountRef = useRef(0);
  const bootstrapGenRef = useRef(0);
  /** 点赞成功/失败后递增；bootstrap 若在点赞完成前发出则不得覆盖 liked */
  const engagementGenRef = useRef(0);
  likedRef.current = liked;
  likeCountRef.current = likeCount;
  const [verseFull, setVerseFull] = useState(false);
  const [heroIllustration, setHeroIllustration] = useState<string | null>(() => {
    const cached = readCachedDailyVerse();
    return cached?.day ? dailyVerseWallpaperUrl(cached.day) : null;
  });
  const [heroBCampaign, setHeroBCampaign] = useState<HeroBCampaign | null>(() => readCachedHeroBCampaign());
  const [heroBCampaignReady, setHeroBCampaignReady] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [groupErr, setGroupErr] = useState<string | null>(null);
  const [heroResetNonce, setHeroResetNonce] = useState(0);

  const applyHeroBCampaign = useCallback(async (campaign: HeroBCampaign | null) => {
    if (!campaign) {
      setHeroBCampaign(null);
      setHeroBCampaignReady(false);
      writeCachedHeroBCampaign(null);
      return;
    }
    const ok = await preloadHeroBCampaignImage(campaign);
    if (!ok) {
      setHeroBCampaign(null);
      setHeroBCampaignReady(false);
      return;
    }
    setHeroBCampaign(campaign);
    setHeroBCampaignReady(true);
    writeCachedHeroBCampaign(campaign);
  }, []);

  const loadHomeBootstrap = useCallback(() => {
    const gen = ++bootstrapGenRef.current;
    const engagementAtStart = engagementGenRef.current;
    setErr(null);
    setBootstrapReady(false);
    const cached = readCachedDailyVerse();
    // 有缓存立刻出字，不等账号/网络
    if (cached) {
      setDv(cached);
      setDvLoading(false);
      void applyHeroBCampaign(readCachedHeroBCampaign()).then(() => {
        if (gen === bootstrapGenRef.current) setBootstrapReady(true);
      });
    } else {
      setDvLoading(true);
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (!cached) {
        setDvLoading(false);
        setBootstrapReady(true);
      }
      markHomeBootstrapReady();
      return;
    }

    // 账号建档与 bootstrap 并行：每日经文不阻塞在 ensureAccountReady 上
    void ensureAccountReady().catch(() => {});
    void api
      .homeBootstrap()
      .then((boot) => {
        if (gen !== bootstrapGenRef.current) return;
        const v = boot.dailyVerse;
        const day = v.day ?? 0;
        const likedVal =
          typeof v.liked === 'boolean'
            ? v.liked
            : (day > 0 ? readLocalDailyVerseLike(day) : null) ?? false;
        const countVal = v.likes_count ?? 0;
        const applyEngagement =
          !likeBusyRef.current
          && engagementAtStart === engagementGenRef.current;
        const cacheLiked = applyEngagement ? likedVal : likedRef.current;
        const cacheCount = applyEngagement ? countVal : likeCountRef.current;
        setDv(v);
        writeCachedDailyVerse({
          ...v,
          liked: cacheLiked,
          likes_count: cacheCount,
        });
        if (applyEngagement) {
          setLiked(likedVal);
          setLikeCount(countVal);
          if (day) writeLocalDailyVerseLike(day, likedVal);
        }
        // Hero 图预载不挡首屏与经包调度
        void applyHeroBCampaign(boot.heroBCampaign);
      })
      .catch((e) => {
        if (gen !== bootstrapGenRef.current) return;
        const fallback = readCachedDailyVerse();
        if (fallback) {
          setDv(fallback);
          setErr(null);
          void applyHeroBCampaign(readCachedHeroBCampaign());
        } else {
          setErr(errorMessage(e, '内容加载失败'));
          setHeroBCampaign(null);
          setHeroBCampaignReady(false);
        }
      })
      .finally(() => {
        if (gen !== bootstrapGenRef.current) return;
        setDvLoading(false);
        setBootstrapReady(true);
        markHomeBootstrapReady();
      });
  }, [applyHeroBCampaign]);

  const reloadDailyContent = useCallback(() => {
    loadHomeBootstrap();
  }, [loadHomeBootstrap]);

  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const go = useCallback((href: string) => {
    navigateAppHref(href, router);
  }, [router]);

  const [plusOpen, setPlusOpen] = useState(false);
  const [railMain, setRailMain] = useState<RailCard[]>([]);
  const [growthCards, setGrowthCards] = useState<HomeGrowthCard[]>([]);
  const [userName, setUserName] = useState('');
  const { activeTab } = useTabKeepAlive();
  const seasonal = currentSeasonalEvents();
  const homeAwake = paneActive && (activeTab == null || activeTab === 'home');

  useEffect(() => {
    // 每日经文直接铺风景图（按 day 轮换）
    setHeroIllustration(dailyVerseWallpaperUrl(dv?.day ?? 1));
  }, [dv?.day]);

  useEffect(() => {
    if (!homeAwake) return;
    return watchChinaDayChange(reloadDailyContent);
  }, [homeAwake, reloadDailyContent]);

  useEffect(() => {
    if (!homeAwake) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') reloadDailyContent();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [homeAwake, reloadDailyContent]);

  useEffect(() => {
    if (!homeAwake) return;
    return initPcWheelPassthrough();
  }, [homeAwake]);

  useEffect(() => {
    if (!homeAwake) return;
    const refreshName = () => {
      setUserName(getDisplayName());
      const report = buildReport();
      setGrowthCards(
        buildHomeGrowthCards({
          todayMin: todayMinutes(),
          monthDays: report.monthDays,
        }),
      );
    };
    refreshName();
    void import('@/lib/bible_warmup').then((m) => m.scheduleBibleWarmup());
    window.addEventListener('focus', refreshName);
    const unsubSync = subscribeSyncState(() => {
      if (getSyncState() === 'synced') refreshName();
    });
    const unsubData = subscribeLocalDataChanged(refreshName);
    return () => {
      window.removeEventListener('focus', refreshName);
      unsubSync();
      unsubData();
    };
  }, [homeAwake]);

  const refreshRail = useCallback(async () => {
    await timedPerf('home.refreshRail', async () => {
    const report = buildReport();
    let planCard:
      | {
          title: string;
          sub: string;
          href: string;
          progressPct?: number;
          bookId?: string;
          chapter?: number;
        }
      | undefined;
    let prayerCard: { title: string; sub: string; href: string } | undefined;
    const active = getActivePlan();
    if (active?.kind === 'prayer') {
      const day = getPlanDay(active.planId) || 1;
      prayerCard = {
        title: `第 ${day} 天`,
        sub: active.title,
        href: prayerTodayHref(active),
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
          sub: `第 ${day} 天 · ${p.done}/${p.total} 段`,
          href: readerHref(fullMeta, idx),
          progressPct: p.total > 0 ? Math.round((p.done / p.total) * 100) : undefined,
          bookId: step.bookId,
          chapter: step.chapterStart,
        };
      }
    }
    let resumeCard:
      | {
          title: string;
          sub: string;
          href: string;
          bookId: string;
          chapter: number;
        }
      | undefined;
    const last = getLastRead();
    if (last) {
      // 用本地书卷名，避免首页串行打 api.books()
      const books = (await loadBooksJson()) ?? seededBooks();
        const book = books.find((b) => b.id === last.bookId);
      const name = book?.name ?? (bookIdToChineseName(last.bookId) || last.bookId);
        resumeCard = {
        title: `${name} ${last.chapter} 章`,
        sub: '继续阅读',
          href: `/reader?book=${last.bookId}&chapter=${last.chapter}`,
        bookId: last.bookId,
        chapter: last.chapter,
      };
    }
    let devotionalCard:
      | {
          title: string;
          sub: string;
          href: string;
          mediaCaption?: string;
          mediaCaptionRight?: string;
          progressPct?: number;
          progressLabel?: string;
        }
      | undefined;
    try {
      const adminOk = await fetchAdminEligible();
      if (adminOk) {
        const card = await api.devotionalHomeCard('genesis_50_walk');
        const scheduled = card.scheduled_day || card.day || 7;
        const doneLabel = `${card.my_days}/${card.days_total}`;
        const schedulePct = Math.round((scheduled / card.days_total) * 100);
        if (card.my_days >= card.days_total && card.days_total > 0) {
          devotionalCard = {
            title: '你已完成创世记 50 次同行',
            sub: '回顾我的默想与祷告',
            href: card.href,
            mediaCaption: '创世记50天',
            mediaCaptionRight: doneLabel,
            progressPct: 100,
            progressLabel: String(scheduled),
          };
        } else if (card.has_opened || card.my_days > 0) {
          devotionalCard = {
            title: `今日第 ${scheduled} 次`,
            sub: `上次停在${tabLabel(card.last_tab)} · 已完成 ${doneLabel}`,
            href: card.href,
            mediaCaption: '创世记50天',
            mediaCaptionRight: doneLabel,
            progressPct: schedulePct,
            progressLabel: String(scheduled),
          };
        } else {
          const people =
            card.participants_count > 0
              ? formatParticipants(card.participants_count)
              : '经文、书信与默想 · 约18分钟';
          devotionalCard = {
            title: '与神同行',
            sub: people,
            href: card.href,
            mediaCaption: '创世记50天',
            mediaCaptionRight: `0/${card.days_total || 50}`,
            progressPct: schedulePct,
            progressLabel: String(scheduled),
          };
        }
      }
    } catch {
      /* 非管理员或不具备权限时不展示入口 */
    }
    let groupCard = buildHomeGroupRailInput([], null);
    setGroupErr(null);
    try {
      const [groupsRes, summaryRes] = await Promise.all([
        api.myGroups(),
        api.discoverSummary(),
      ]);
      groupCard = buildHomeGroupRailInput(groupsRes.groups, summaryRes);
    } catch (e) {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        setGroupErr(errorMessage(e, '小组动态加载失败'));
      }
    }
    const suggest = nextReadingSuggestion();
    let assistantCard: { title: string; sub: string; href: string } | undefined;
    // 复用 bootstrap/缓存的每日经文，避免第二次 dailyVerse 请求
    const cachedDv = readCachedDailyVerse();
    const dvRef = cachedDv?.ref;
    if (dvRef) {
      const q = '这段经文里，神的应许对你意味着什么？';
      assistantCard = {
        title: dvRef,
        sub: '',
        href: assistantHref(dvRef, {
          question: q,
          autoSend: true,
          surface: 'home_prefill',
        }),
      };
    }
    const memCount = listAllThoughts().length;
    const latestThought = listAllThoughts()[0];
    const notesCard = {
      title: memCount > 0 ? `${memCount} 条想法` : '我的想法',
      sub: memCount > 0 ? '想法 · 划线' : '想法 · 划线',
      href: '/notes',
      count: memCount,
      excerpt: latestThought?.body?.trim().slice(0, 48),
    };
    const pendingBookLocal = getPendingBookChallenge();
    const { main } = buildHomeRail({
      plan: planCard,
      resume: resumeCard,
      devotional: devotionalCard,
      group: groupCard,
      prayer: prayerCard,
      suggest: suggest
        ? {
            title: suggest.title,
            sub: suggest.reason,
            href: suggest.href,
            bookId: bookIdFromReaderHref(suggest.href)?.bookId,
          }
        : undefined,
      assistant: assistantCard,
      notes: notesCard,
      challenge: pendingBookLocal
        ? {
            title: `《${pendingBookLocal.bookName}》`,
            sub: '巩固问答',
            href: '/challenge',
            bookId: pendingBookLocal.bookId,
          }
        : undefined,
    });
    setRailMain(main);
    setGrowthCards(
      buildHomeGrowthCards({
        todayMin: todayMinutes(),
        monthDays: report.monthDays,
      }),
    );
    });
  }, []);

  useEffect(() => {
    if (!homeAwake) return;
    const onRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshRail();
    };
    document.addEventListener('visibilitychange', onRefresh);
    window.addEventListener('focus', onRefresh);
    return () => {
      document.removeEventListener('visibilitychange', onRefresh);
      window.removeEventListener('focus', onRefresh);
    };
  }, [homeAwake, refreshRail]);

  useEffect(() => {
    if (!homeAwake) return;
    // 社交轨道延后，先让每日经文占满带宽
    const t = window.setTimeout(() => {
      void refreshRail();
    }, 600);
    void reloadDailyContent();
    if (consumeHeroReturnToVerse()) {
      setHeroResetNonce((n) => n + 1);
    }
    return () => window.clearTimeout(t);
  }, [homeAwake, refreshRail, reloadDailyContent]);

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
    likeBusyRef.current = true;
    engagementGenRef.current += 1;
    setLikeBusy(true);
    setLikeErr(null);
    setLiked(nextLiked);
    setLikeCount(nextCount);
    likedRef.current = nextLiked;
    likeCountRef.current = nextCount;
    writeLocalDailyVerseLike(verseDay, nextLiked);
    try {
      const r = await api.toggleDailyVerseLike(verseDay);
      // 以 toggle 响应为准；若字段缺失则保留乐观更新
      const syncedLiked = typeof r.liked === 'boolean' ? r.liked : nextLiked;
      const syncedCount =
        typeof r.likes_count === 'number' ? r.likes_count : nextCount;
      engagementGenRef.current += 1;
      setLiked(syncedLiked);
      setLikeCount(syncedCount);
      likedRef.current = syncedLiked;
      likeCountRef.current = syncedCount;
      writeLocalDailyVerseLike(verseDay, syncedLiked);
      const snap = readCachedDailyVerse();
      if (snap && snap.day === verseDay) {
        writeCachedDailyVerse({
          ...snap,
          liked: syncedLiked,
          likes_count: syncedCount,
        });
      }
    } catch (e) {
      engagementGenRef.current += 1;
      setLiked(prevLiked);
      setLikeCount(prevCount);
      likedRef.current = prevLiked;
      likeCountRef.current = prevCount;
      writeLocalDailyVerseLike(verseDay, prevLiked);
      setLikeErr(errorMessage(e, '暂时无法点赞，请稍后再试'));
    } finally {
      likeBusyRef.current = false;
      setLikeBusy(false);
    }
  }, [likeBusy, dv, liked, likeCount]);

  return (
    <main className="container home-page">
      <header className="greet home-greet-header">
        <HomeGreetStreak greeting={timeOfDayGreeting()} userName={userName} />
        <div className="greet-actions">
          <button
            type="button"
            aria-label="搜索"
            className="icon-btn"
            onClick={() => go('/search')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
          </button>
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
        <button
          type="button"
          className="card row-card home-list-row home-list-row-wrap seasonal-card seasonal-card-pulse"
          onClick={() => go(seasonal[0].href)}
        >
          <span className="pill pill-active">{seasonal[0].badge}</span>
          <span className="home-list-main">
            <strong>{seasonal[0].title}</strong>
            <span className="muted home-list-sub">{seasonal[0].subtitle}</span>
          </span>
          <span className="muted home-list-chevron">›</span>
        </button>
      )}

      <HomeHeroCarousel
        verseSlide={(
      <div
        className={`card card-3 hero-verse hero-verse-has-art ${heroThemeClass(dv?.theme)}`}
        aria-label={dv?.ref ? `欣赏 ${dv.ref}` : '每日经文'}
        onClick={openVerseWallpaper}
        onContextMenu={(e) => e.preventDefault()}
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
        <div className="hero-inner hero-inner-split">
          <span className="hero-kicker hero-kicker-corner">每日经文</span>
          <div className="hero-main">
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
                onClick={(e) => { e.stopPropagation(); loadHomeBootstrap(); }}
            >
              点击重试
            </button>
          )}
          </div>
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
        )}
        campaign={heroBCampaign}
        campaignReady={heroBCampaignReady}
        bootstrapReady={bootstrapReady}
        resetToVerseNonce={heroResetNonce}
      />

      <p className="section-label home-rail-section-label">今日推荐</p>
      <div className="home-stack home-stack-rail">
        {groupErr ? (
          <ErrorBanner message={groupErr} onRetry={() => void refreshRail()} />
        ) : null}
        <HomeRail cards={railMain} />
      </div>

      <HomeOnboardingBanner />

      <p className="section-label">成长与回忆</p>
      <HomeGrowthStack cards={growthCards} onGo={go} />

      <PlusMenu anchorRef={plusBtnRef} open={plusOpen} onClose={() => setPlusOpen(false)} />

      {verseFull && dv ? (
        <DailyVerseWallpaper
          dv={dv}
          backgroundUrl={dailyVerseWallpaperUrl(dv.day, 'full')}
          onClose={() => setVerseFull(false)}
        />
      ) : null}
    </main>
  );
}
