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
import { watchChinaDayChange } from '@/lib/daily_clock';
import { subscribeLocalDataChanged } from '@/lib/local_data_events';
import { getSyncState, subscribeSyncState } from '@/lib/sync_status';
import { navigateAppHref } from '@/lib/pwa_tab_nav';
import { initPcWheelPassthrough } from '@/lib/pc_wheel_passthrough';

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

export default function HomePageClient() {
  const [dv, setDv] = useState<DailyVerse | null>(() => readCachedDailyVerse());
  const [err, setErr] = useState<string | null>(null);
  const [dvLoading, setDvLoading] = useState(true);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeErr, setLikeErr] = useState<string | null>(null);
  const [verseFull, setVerseFull] = useState(false);
  const [heroIllustration, setHeroIllustration] = useState<string | null>(() => {
    const cached = readCachedDailyVerse();
    return cached?.day ? dailyVerseWallpaperUrl(cached.day) : null;
  });
  const [heroBCampaign, setHeroBCampaign] = useState<HeroBCampaign | null>(() => readCachedHeroBCampaign());
  const [heroBCampaignReady, setHeroBCampaignReady] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);
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
    setDvLoading(true);
    setErr(null);
    setBootstrapReady(false);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = readCachedDailyVerse();
      if (cached) {
        setDv(cached);
        setDvLoading(false);
        void applyHeroBCampaign(readCachedHeroBCampaign()).then(() => setBootstrapReady(true));
        return;
      }
    }
    void ensureAccountReady()
      .then(() => api.homeBootstrap())
      .then(async (boot) => {
        const v = boot.dailyVerse;
        const day = v.day ?? 0;
        const likedVal =
          typeof v.liked === 'boolean'
            ? v.liked
            : (day > 0 ? readLocalDailyVerseLike(day) : null) ?? false;
        const countVal = v.likes_count ?? 0;
        setDv(v);
        writeCachedDailyVerse(v);
        setLiked(likedVal);
        setLikeCount(countVal);
        if (day) writeLocalDailyVerseLike(day, likedVal);
        await applyHeroBCampaign(boot.heroBCampaign);
      })
      .catch(async (e) => {
        const cached = readCachedDailyVerse();
        if (cached) {
          setDv(cached);
          setErr(null);
          await applyHeroBCampaign(readCachedHeroBCampaign());
        } else {
          setErr(errorMessage(e, '内容加载失败'));
          setHeroBCampaign(null);
          setHeroBCampaignReady(false);
        }
      })
      .finally(() => {
        setDvLoading(false);
        setBootstrapReady(true);
      });
  }, [applyHeroBCampaign]);

  const reloadDailyContent = useCallback(() => {
    loadHomeBootstrap();
  }, [loadHomeBootstrap]);

  useEffect(() => {
    reloadDailyContent();
  }, [reloadDailyContent]);

  useEffect(() => {
    return watchChinaDayChange(reloadDailyContent);
  }, [reloadDailyContent]);

  useEffect(() => {
    // 每日经文直接铺风景图（按 day 轮换）
    setHeroIllustration(dailyVerseWallpaperUrl(dv?.day ?? 1));
  }, [dv?.day]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') reloadDailyContent();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [reloadDailyContent]);

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

  useEffect(() => {
    if (activeTab != null && activeTab !== 'home') return;
    return initPcWheelPassthrough();
  }, [activeTab]);

  useEffect(() => {
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
  }, []);

  const refreshRail = useCallback(async () => {
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
      try {
        const { books } = await api.books();
        const book = books.find((b) => b.id === last.bookId);
        const name = book?.name ?? last.bookId;
        resumeCard = {
          title: `${name} ${last.chapter} 章`,
          sub: '继续阅读',
          href: `/reader?book=${last.bookId}&chapter=${last.chapter}`,
          bookId: last.bookId,
          chapter: last.chapter,
        };
      } catch {
        resumeCard = {
          title: `第 ${last.chapter} 章`,
          sub: '继续阅读',
          href: `/reader?book=${last.bookId}&chapter=${last.chapter}`,
          bookId: last.bookId,
          chapter: last.chapter,
        };
      }
    }
    let groupCard = buildHomeGroupRailInput([], null);
    try {
      const [groupsRes, summaryRes] = await Promise.all([
        api.myGroups(),
        api.discoverSummary(),
      ]);
      groupCard = buildHomeGroupRailInput(groupsRes.groups, summaryRes);
    } catch {
      /* 离线时保留默认邀请卡 */
    }
    const suggest = nextReadingSuggestion();
    let assistantCard: { title: string; sub: string; href: string } | undefined;
    try {
      const dv = await api.dailyVerse();
      if (dv?.ref) {
        const q = '这段经文里，神的应许对你意味着什么？';
        assistantCard = {
          title: dv.ref,
          sub: '',
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
    const memCount = listAllThoughts().length;
    const latestThought = listAllThoughts()[0];
    const notesCard = {
      title: memCount > 0 ? `${memCount} 条想法` : '我的想法',
      sub: memCount > 0 ? '查看全部' : '收藏与划线',
      href: '/notes',
      count: memCount,
      excerpt: latestThought?.body?.trim().slice(0, 48),
    };
    const pendingBookLocal = getPendingBookChallenge();
    const { main } = buildHomeRail({
      plan: planCard,
      resume: resumeCard,
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
  }, []);

  useEffect(() => {
    refreshRail();
  }, [refreshRail]);

  useEffect(() => {
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
  }, [refreshRail]);

  useEffect(() => {
    if (activeTab === 'home') {
      void refreshRail();
      void reloadDailyContent();
      if (consumeHeroReturnToVerse()) {
        setHeroResetNonce((n) => n + 1);
      }
    }
  }, [activeTab, refreshRail, reloadDailyContent]);

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
        <HomeRail cards={railMain} />
      </div>

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
