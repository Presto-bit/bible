'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  type DailyVerse,
  type DailyVerseReactPreset,
  type DailyVerseReactTopPreset,
  ensureAccountReady,
  getDisplayName,
} from '@/lib/api';
import DailyVerseWallpaper from '@/components/DailyVerseWallpaper';
import DailyVerseReactSheet from '@/components/DailyVerseReactSheet';
import { dailyVerseWallpaperUrl } from '@/lib/daily_verse_wallpaper';
import { writeLocalDailyVerseLike, readLocalDailyVerseLike } from '@/lib/daily_verse_engagement';
import { shareDailyVerseCard } from '@/lib/daily_verse_share';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import { currentSeasonalEvents } from '@/lib/gamification';
import { getActivePlan, getPlanDay } from '@/lib/plan_progress';
import { prayerTodayHref, activePlanTodayHrefSync } from '@/lib/plan_today_href';
import { buildPlanReadingMeta, readerHref, resumeStepIndex } from '@/lib/plan_reading';
import { getPlanSession } from '@/lib/plan_session';
import { sessionProgress } from '@/lib/plan_steps';
import { buildReport, getLastRead, todayMinutes } from '@/lib/reading';
import { nextReadingSuggestion } from '@/lib/suggestions';
import PlusMenu from '@/components/PlusMenu';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import { heroThemeClass } from '@/lib/home_rail';
import { bookIdFromReaderHref } from '@/lib/book_cover';
import { buildHomeTodayPanel, type HomeTodayPanelInput, type HomeTodayPanelModel } from '@/lib/home_today_panel';
import {
  mapApiCampaignsToHomeInput,
  readCachedHomeCampaigns,
  writeCachedHomeCampaigns,
} from '@/lib/home_campaigns_cache';
import { HomeTodayPanel } from '@/components/home/HomeTodayPanel';
import { HomeGreetStreak } from '@/components/home/HomeGreetStreak';
import { HomeHeroCarousel } from '@/components/home/HomeHeroCarousel';
import { buildHomeGroupRailInput } from '@/lib/home_social_line';
import {
  buildHomeAnchorBlock,
  buildHomeAnchorFromGroupRail,
  type HomeAnchorBlockModel,
} from '@/lib/home_anchor_block';
import {
  type HeroBCampaign,
  preloadHeroBCampaignImage,
  readCachedHeroBCampaign,
  writeCachedHeroBCampaign,
} from '@/lib/hero_b_campaign';
import { consumeHeroReturnToVerse } from '@/lib/hero_b_nav';
import { useTabKeepAlive } from '@/components/shell/TabKeepAliveContext';
import { buildHomeGrowthModel, type HomeGrowthModel } from '@/lib/home_growth_cards';
import { formatDailyVerseQuote } from '@/lib/daily_verse_display';
import { HomeGrowthStack } from '@/components/home/HomeGrowthStack';
import { readCachedDailyVerse, writeCachedDailyVerse } from '@/lib/daily_verse_cache';
import { bookIdToChineseName } from '@/lib/ref_label';
import { timedPerf } from '@/lib/perf_rum';
import { watchChinaDayChange } from '@/lib/daily_clock';
import { subscribeLocalDataChanged } from '@/lib/local_data_events';
import { getSyncState, subscribeSyncState } from '@/lib/sync_status';
import { navigateAppHref } from '@/lib/pwa_tab_nav';
import { initPcWheelPassthrough } from '@/lib/pc_wheel_passthrough';
import { markHomeBootstrapReady } from '@/lib/offline_bootstrap';
import HomeOnboardingBanner from '@/components/home/HomeOnboardingBanner';
import {
  HOME_BOOTSTRAP_TTL_MS,
  HOME_RAIL_NET_TTL_MS,
  HOME_REFRESH_DEBOUNCE_MS,
  shouldFetchHomeNetwork,
} from '@/lib/home_refresh';
import {
  useHomePullRefresh,
  usePrefersReducedMotion,
} from '@/lib/use_home_pull_refresh';
import { hapticLight, hapticSuccess } from '@/lib/haptic';

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
  const [reactCount, setReactCount] = useState(() => readCachedDailyVerse()?.reacts_count ?? 0);
  const [myReact, setMyReact] = useState<DailyVerseReactPreset | null>(
    () => readCachedDailyVerse()?.my_react ?? null,
  );
  const [topPresets, setTopPresets] = useState<DailyVerseReactTopPreset[]>(
    () => readCachedDailyVerse()?.top_presets ?? [],
  );
  const [reactSheetOpen, setReactSheetOpen] = useState(false);
  const [reactErr, setReactErr] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const likeBusyRef = useRef(false);
  const likedRef = useRef(false);
  const likeCountRef = useRef(0);
  const reactCountRef = useRef(0);
  const myReactRef = useRef<DailyVerseReactPreset | null>(null);
  const bootstrapGenRef = useRef(0);
  /** 点赞成功/失败后递增；bootstrap 若在点赞完成前发出则不得覆盖 liked */
  const engagementGenRef = useRef(0);
  likedRef.current = liked;
  likeCountRef.current = likeCount;
  reactCountRef.current = reactCount;
  myReactRef.current = myReact;
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

  // 加速 Hero LCP：尽早 preload 当日壁纸（体积已压缩，且不再由 SW install 预拉）
  useEffect(() => {
    if (!heroIllustration || typeof document === 'undefined') return;
    const id = 'presto-hero-wallpaper-preload';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'preload';
      link.as = 'image';
      document.head.appendChild(link);
    }
    if (link.href !== heroIllustration) link.href = heroIllustration;
  }, [heroIllustration]);

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

  /** bootstrap 写完活动缓存后触发本地面板重绘（避免依赖 refreshRail 声明顺序） */
  const applyCachedCampaignsPaintRef = useRef<() => void>(() => {});

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
        const reactCountVal = v.reacts_count ?? 0;
        const myReactVal = v.my_react ?? null;
        const topPresetsVal = v.top_presets ?? [];
        const applyEngagement =
          !likeBusyRef.current
          && engagementAtStart === engagementGenRef.current;
        const cacheLiked = applyEngagement ? likedVal : likedRef.current;
        const cacheCount = applyEngagement ? countVal : likeCountRef.current;
        const cacheReactCount = applyEngagement ? reactCountVal : reactCountRef.current;
        const cacheMyReact = applyEngagement ? myReactVal : myReactRef.current;
        setDv(v);
        writeCachedDailyVerse({
          ...v,
          liked: cacheLiked,
          likes_count: cacheCount,
          reacts_count: cacheReactCount,
          my_react: cacheMyReact,
          top_presets: applyEngagement ? topPresetsVal : (readCachedDailyVerse()?.top_presets ?? []),
        });
        if (applyEngagement) {
          setLiked(likedVal);
          setLikeCount(countVal);
          setReactCount(reactCountVal);
          setMyReact(myReactVal);
          setTopPresets(topPresetsVal);
          if (day) writeLocalDailyVerseLike(day, likedVal);
        }
        // Hero 图预载不挡首屏与经包调度
        void applyHeroBCampaign(boot.heroBCampaign);
        if (Array.isArray(boot.railCampaigns)) {
          writeCachedHomeCampaigns(mapApiCampaignsToHomeInput(boot.railCampaigns));
          // 用本地重绘把运营卡并进今日推荐，避免再打 /campaigns/home
          applyCachedCampaignsPaintRef.current();
        }
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
  const [todayPanel, setTodayPanel] = useState<HomeTodayPanelModel | null>(null);
  const [growthModel, setGrowthModel] = useState<HomeGrowthModel | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return buildHomeGrowthModel();
    } catch {
      return null;
    }
  });
  const [anchorBlock, setAnchorBlock] = useState<HomeAnchorBlockModel | null>(() => {
    if (typeof window === 'undefined') return null;
    return buildHomeAnchorBlock([], null);
  });
  const [ptrToast, setPtrToast] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const { activeTab } = useTabKeepAlive();
  const seasonal = currentSeasonalEvents();
  const homeAwake = paneActive && (activeTab == null || activeTab === 'home');
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // 每日经文直接铺风景图（按 day 轮换）
    setHeroIllustration(dailyVerseWallpaperUrl(dv?.day ?? 1));
  }, [dv?.day]);

  useEffect(() => {
    if (!homeAwake) return;
    return initPcWheelPassthrough();
  }, [homeAwake]);

  const lastRailNetAtRef = useRef(0);
  const lastBootstrapAtRef = useRef(0);
  const homeRefreshTimerRef = useRef<number | null>(null);
  const lastGroupInputRef = useRef<HomeTodayPanelInput['group']>(undefined);
  const lastAnchorRef = useRef<HomeAnchorBlockModel | null>(null);
  const bibleWarmupOnceRef = useRef(false);

  const paintLocalChrome = useCallback(() => {
    setUserName(getDisplayName());
    const report = buildReport();
    setGrowthModel(
      buildHomeGrowthModel({
        todayMin: todayMinutes(),
        monthDays: report.monthDays,
      }),
    );
    if (!lastAnchorRef.current) {
      const fallback = buildHomeAnchorBlock([], null);
      lastAnchorRef.current = fallback;
      setAnchorBlock(fallback);
    }
  }, []);

  const refreshRail = useCallback(async (opts?: { fetchRemote?: boolean }) => {
    const fetchRemote = opts?.fetchRemote !== false;
    await timedPerf('home.refreshRail', async () => {
      type PlanCard = {
        title: string;
        sub: string;
        href: string;
        progressPct?: number;
        bookId?: string;
        chapter?: number;
      };
      type ResumeCard = {
        title: string;
        sub: string;
        href: string;
        bookId: string;
        chapter: number;
      };

      const report = buildReport();
      const suggest = nextReadingSuggestion();
      const suggestInput = suggest
        ? {
            title: suggest.title,
            sub: suggest.reason,
            href: suggest.href,
            bookId: bookIdFromReaderHref(suggest.href)?.bookId,
          }
        : undefined;

      let prayerCard: { title: string; sub: string; href: string } | undefined;
      let planCard: PlanCard | undefined;
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
        planCard = {
          title: active.title,
          sub: `第 ${day} 天`,
          href: activePlanTodayHrefSync(active),
        };
      }

      let resumeCard: ResumeCard | undefined;
      const last = getLastRead();
      if (last) {
        const name = bookIdToChineseName(last.bookId) || last.bookId;
        resumeCard = {
          title: `${name} ${last.chapter} 章`,
          sub: '',
          href: `/reader?book=${last.bookId}&chapter=${last.chapter}`,
          bookId: last.bookId,
          chapter: last.chapter,
        };
      }

      const cachedCampaigns = readCachedHomeCampaigns({ allowStale: true }) || undefined;
      const localGroup =
        lastGroupInputRef.current || buildHomeGroupRailInput([], null);
      const localAnchor =
        lastAnchorRef.current || buildHomeAnchorFromGroupRail(localGroup);
      lastAnchorRef.current = localAnchor;
      setAnchorBlock(localAnchor);

      // 本地先上屏；TTL 内跳过网络时沿用上次小组卡 + 活动缓存
      setTodayPanel(
        buildHomeTodayPanel({
          plan: planCard,
          resume: resumeCard,
          group: localGroup,
          prayer: prayerCard,
          suggest: suggestInput,
          campaigns: cachedCampaigns,
        }),
      );
      setGrowthModel(
        buildHomeGrowthModel({
          todayMin: todayMinutes(),
          monthDays: report.monthDays,
        }),
      );

      if (!fetchRemote) return;

      setGroupErr(null);
      const planDay =
        active && active.kind !== 'prayer' ? getPlanDay(active.planId) || 1 : 1;

      const planMetaPromise =
        active && active.kind !== 'prayer'
          ? buildPlanReadingMeta(active, planDay).catch(() => null)
          : Promise.resolve(null);

      const socialPromise = Promise.all([api.myGroups(), api.discoverSummary()])
        .then(([groupsRes, summaryRes]) => {
          const groups = Array.isArray(groupsRes.groups) ? groupsRes.groups : [];
          return {
            rail: buildHomeGroupRailInput(groups, summaryRes),
            anchor: buildHomeAnchorBlock(groups, summaryRes),
          };
        })
        .catch((e) => {
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            setGroupErr(errorMessage(e, '小组动态加载失败'));
          }
          const rail =
            lastGroupInputRef.current || buildHomeGroupRailInput([], null);
          return {
            rail,
            anchor: lastAnchorRef.current || buildHomeAnchorFromGroupRail(rail),
          };
        });

      // 运营卡改由 homeBootstrap.railCampaigns 写入缓存；此处不再打 /campaigns/home
      const [meta, social] = await Promise.all([
        planMetaPromise,
        socialPromise,
      ]);
      const groupCard = social.rail;
      const nextAnchor = social.anchor;

      if (meta && active && active.kind !== 'prayer') {
        const sess = getPlanSession(active.planId, planDay) ?? meta.session;
        const fullMeta = { ...meta, session: sess };
        const idx = resumeStepIndex(fullMeta);
        const step = meta.steps[idx] ?? meta.steps[0];
        const p = sessionProgress(meta.steps, sess.stepsDone);
        planCard = {
          title: step.label,
          sub: `第 ${planDay} 天 · ${p.done}/${p.total} 段`,
          href: readerHref(fullMeta, idx),
          progressPct:
            p.total > 0 ? Math.round((p.done / p.total) * 100) : undefined,
          bookId: step.bookId,
          chapter: step.chapterStart,
        };
      }

      const nextCampaigns = readCachedHomeCampaigns({ allowStale: true }) || undefined;

      lastGroupInputRef.current = groupCard;
      lastAnchorRef.current = nextAnchor;
      lastRailNetAtRef.current = Date.now();
      setAnchorBlock(nextAnchor);

      setTodayPanel(
        buildHomeTodayPanel({
          plan: planCard,
          resume: resumeCard,
          group: groupCard,
          prayer: prayerCard,
          campaigns: nextCampaigns,
          suggest: suggestInput,
        }),
      );
    });
  }, []);

  useEffect(() => {
    applyCachedCampaignsPaintRef.current = () => {
      void refreshRail({ fetchRemote: false });
    };
  }, [refreshRail]);

  const refreshHome = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = Boolean(opts?.force);
      paintLocalChrome();

      const needRailNet = shouldFetchHomeNetwork(
        lastRailNetAtRef.current,
        HOME_RAIL_NET_TTL_MS,
        force,
      );
      const needBoot = shouldFetchHomeNetwork(
        lastBootstrapAtRef.current,
        HOME_BOOTSTRAP_TTL_MS,
        force,
      );

      await refreshRail({ fetchRemote: needRailNet });

      if (needBoot) {
        lastBootstrapAtRef.current = Date.now();
        reloadDailyContent();
      }
    },
    [paintLocalChrome, refreshRail, reloadDailyContent],
  );

  const onPullRefresh = useCallback(async () => {
    try {
      await refreshHome({ force: true });
      if (!reducedMotion) hapticSuccess();
    } catch (e) {
      setPtrToast(errorMessage(e, '刷新失败，请稍后再试'));
      window.setTimeout(() => setPtrToast(null), 2200);
      if (!reducedMotion) hapticLight();
    }
  }, [refreshHome, reducedMotion]);

  const homeRootRef = useRef<HTMLElement | null>(null);
  const ptrContentRef = useRef<HTMLDivElement | null>(null);
  const ptrIndicatorRef = useRef<HTMLDivElement | null>(null);
  const ptrLabelRef = useRef<HTMLSpanElement | null>(null);
  const endFooterRef = useRef<HTMLDivElement | null>(null);

  const { refreshing: ptrRefreshing } = useHomePullRefresh({
    enabled: homeAwake,
    reducedMotion,
    onRefresh: onPullRefresh,
    rootRef: homeRootRef,
    contentRef: ptrContentRef,
    indicatorRef: ptrIndicatorRef,
    labelRef: ptrLabelRef,
    endFooterRef,
  });

  const scheduleHomeRefresh = useCallback(
    (force = false) => {
      if (homeRefreshTimerRef.current != null) {
        window.clearTimeout(homeRefreshTimerRef.current);
      }
      homeRefreshTimerRef.current = window.setTimeout(() => {
        homeRefreshTimerRef.current = null;
        void refreshHome({ force });
      }, HOME_REFRESH_DEBOUNCE_MS);
    },
    [refreshHome],
  );

  useEffect(() => {
    if (!homeAwake) return;
    return watchChinaDayChange(() => {
      void refreshHome({ force: true });
    });
  }, [homeAwake, refreshHome]);

  useEffect(() => {
    if (!homeAwake) return;
    paintLocalChrome();
    if (!bibleWarmupOnceRef.current) {
      bibleWarmupOnceRef.current = true;
      void import('@/lib/bible_warmup').then((m) => m.scheduleBibleWarmup());
    }
    // 进入首页：立刻刷新；网络部分受 TTL 约束（首次 last*=0 会拉网）
    void refreshHome({ force: false });
    if (consumeHeroReturnToVerse()) {
      setHeroResetNonce((n) => n + 1);
    }

    const onForeground = () => {
      if (document.visibilityState !== 'visible') return;
      scheduleHomeRefresh(false);
    };
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onForeground);

    const unsubSync = subscribeSyncState(() => {
      if (getSyncState() === 'synced') paintLocalChrome();
    });
    const unsubData = subscribeLocalDataChanged(() => paintLocalChrome());

    return () => {
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('focus', onForeground);
      unsubSync();
      unsubData();
      if (homeRefreshTimerRef.current != null) {
        window.clearTimeout(homeRefreshTimerRef.current);
        homeRefreshTimerRef.current = null;
      }
    };
  }, [homeAwake, paintLocalChrome, refreshHome, scheduleHomeRefresh]);

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

  const applyReactStats = useCallback(
    (next: {
      my_react: DailyVerseReactPreset | null;
      reacts_count: number;
      top_presets: DailyVerseReactTopPreset[];
    }) => {
      engagementGenRef.current += 1;
      setMyReact(next.my_react);
      setReactCount(next.reacts_count);
      setTopPresets(next.top_presets);
      setReactErr(null);
      const snap = readCachedDailyVerse();
      if (snap && snap.day === dv?.day) {
        writeCachedDailyVerse({
          ...snap,
          my_react: next.my_react,
          reacts_count: next.reacts_count,
          top_presets: next.top_presets,
        });
      }
    },
    [dv?.day],
  );

  const shareDailyVerse = useCallback(async () => {
    if (!dv?.text) return;
    try {
      const result = await shareDailyVerseCard({
        ref: dv.ref || '每日经文',
        text: dv.text,
        day: dv.day,
        versionLabel: '和合本',
      });
      if (result === 'cancelled') return;
      if (result === 'failed') {
        setShareToast('暂时无法分享');
        window.setTimeout(() => setShareToast(null), 2200);
        return;
      }
      if (result === 'shared' || result === 'copied' || result === 'downloaded') {
        try {
          const r = await api.recordDailyVerseShare(dv.day);
          if (typeof r.shares_count === 'number') {
            setDv((prev) => (prev ? { ...prev, shares_count: r.shares_count } : prev));
            const snap = readCachedDailyVerse();
            if (snap && snap.day === dv.day) {
              writeCachedDailyVerse({ ...snap, shares_count: r.shares_count });
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (result === 'copied') {
        setShareToast('已复制文案与链接');
        window.setTimeout(() => setShareToast(null), 2200);
      } else if (result === 'downloaded') {
        setShareToast('已保存经文卡片');
        window.setTimeout(() => setShareToast(null), 2200);
      }
    } catch (e) {
      setShareToast(errorMessage(e, '暂时无法分享'));
      window.setTimeout(() => setShareToast(null), 2200);
    }
  }, [dv]);

  return (
    <main
      ref={homeRootRef}
      className={`container home-page${ptrRefreshing ? ' is-ptr-refreshing' : ''}`}
    >
      <div
        ref={ptrIndicatorRef}
        className="home-ptr-indicator"
        aria-hidden={!ptrRefreshing}
      >
        <span ref={ptrLabelRef} className={`home-ptr-label${ptrRefreshing ? ' is-busy' : ''}`} />
      </div>
      <div ref={ptrContentRef} className="home-ptr-content">
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
                ? formatDailyVerseQuote(dv.text)
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
              className={`hero-action hero-like${liked ? ' hero-like-active' : ''}`}
              disabled={likeBusy || !dv?.day}
              aria-pressed={liked}
              aria-label={liked ? '取消点赞' : '点赞'}
              onClick={async (e) => {
                e.stopPropagation();
                await toggleLike();
              }}
            >
              {liked ? (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="hero-action-icon">
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
                  className="hero-action-icon"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              )}
              {likeCount > 0 ? <span>{likeCount.toLocaleString()}</span> : null}
            </button>
            <button
              type="button"
              className={`hero-action hero-react${myReact ? ' hero-react-active' : ''}`}
              disabled={!dv?.day}
              aria-pressed={!!myReact}
              aria-label={myReact ? `我的回应：${myReact.label}` : '回应今日经文'}
              onClick={(e) => {
                e.stopPropagation();
                setReactErr(null);
                setReactSheetOpen(true);
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                aria-hidden
                className="hero-action-icon"
                fill={myReact ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              {reactCount > 0 ? <span>{reactCount.toLocaleString()}</span> : null}
            </button>
            <button
              type="button"
              className="hero-action hero-xiaoai"
              disabled={!dv?.ref}
              aria-label={dv?.ref ? `用小爱解读今日经文：${dv.ref}` : '用小爱解读今日经文'}
              onClick={(e) => {
                e.stopPropagation();
                if (!dv?.ref) return;
                navigateToAssistant(dv.ref, {
                  question: `请简要解读今天这节经文（${dv.ref}），先抓住核心信息，再给一点今日应用。`,
                  scene: 'verse_full',
                  surface: 'home_daily_verse',
                });
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                aria-hidden
                className="hero-action-icon"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3l1.09 3.35L16.5 7.5l-3.41 1.15L12 12l-1.09-3.35L7.5 7.5l3.41-1.15L12 3z" />
                <path d="M18.5 13l.7 2.15L21.5 16l-2.3.75L18.5 19l-.7-2.25L15.5 16l2.3-.85L18.5 13z" />
                <path d="M5.5 14l.55 1.7L7.8 16.5l-1.75.55L5.5 18.8l-.55-1.75L3.2 16.5l1.75-.8L5.5 14z" />
              </svg>
            </button>
            <button
              type="button"
              className="hero-action hero-share"
              disabled={!dv?.text}
              aria-label="分享今日经文"
              onClick={(e) => {
                e.stopPropagation();
                void shareDailyVerse();
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                aria-hidden
                className="hero-action-icon"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.59 13.51 15.42 17.49M15.41 6.51 8.59 10.49" />
              </svg>
              {(dv?.shares_count ?? 0) > 0 ? (
                <span>{(dv?.shares_count ?? 0).toLocaleString()}</span>
              ) : null}
            </button>
            {(likeErr || reactErr) && (
              <p className="muted hero-actions-err" role="alert">
                {likeErr || reactErr}
              </p>
            )}
            {shareToast ? (
              <p className="muted hero-actions-err" role="status">
                {shareToast}
              </p>
            ) : null}
          </div>
        </div>
      </div>
        )}
        campaign={heroBCampaign}
        campaignReady={heroBCampaignReady}
        bootstrapReady={bootstrapReady}
        resetToVerseNonce={heroResetNonce}
      />

      {reactSheetOpen && dv?.day ? (
        <DailyVerseReactSheet
          day={dv.day}
          myReact={myReact}
          reactsCount={reactCount}
          topPresets={topPresets}
          onClose={() => setReactSheetOpen(false)}
          onChanged={applyReactStats}
        />
      ) : null}

      {todayPanel ? <HomeTodayPanel panel={todayPanel} /> : null}
      {groupErr ? (
        <div className="home-stack home-stack-rail" style={{ marginTop: 10 }}>
          <ErrorBanner message={groupErr} onRetry={() => void refreshHome({ force: true })} />
        </div>
      ) : null}

      <HomeOnboardingBanner />

      {growthModel ? (
        <HomeGrowthStack
          model={growthModel}
          anchor={anchorBlock}
          onGo={go}
          reducedMotion={reducedMotion}
          endFooterRef={endFooterRef}
        />
      ) : null}

      {ptrToast ? (
        <p className="home-ptr-toast" role="status">
          {ptrToast}
        </p>
      ) : null}
      </div>

      <PlusMenu anchorRef={plusBtnRef} open={plusOpen} onClose={() => setPlusOpen(false)} />

      {verseFull && dv ? (
        <DailyVerseWallpaper
          dv={dv}
          backgroundUrl={dailyVerseWallpaperUrl(dv.day, 'full')}
          onClose={() => setVerseFull(false)}
          liked={liked}
          likeCount={likeCount}
          likeBusy={likeBusy}
          onToggleLike={() => void toggleLike()}
          myReact={myReact}
          reactCount={reactCount}
          onOpenReact={() => {
            setReactErr(null);
            setReactSheetOpen(true);
          }}
          onShare={() => void shareDailyVerse()}
        />
      ) : null}
    </main>
  );
}
