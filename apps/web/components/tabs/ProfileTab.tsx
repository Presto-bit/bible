'use client';

import dynamic from 'next/dynamic';
import '@/styles/profile.css';
import '@/styles/avatar_picker.css';
import '@/styles/reader_catalog.css';
import '@/styles/plans.css';
import '@/styles/group_chat.css';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import {
  api,
  changeUsername,
  currentUserId,
  effectiveId,
  ensureAccountReady,
  getDisplayName,
  getUserName,
  guestId,
  hasPassword,
} from '@/lib/api';
import {
  displayNameHint,
  isSystemGeneratedUsername,
} from '@/lib/system_username';
import {
  getOfflineDownloadSnapshot,
  isOfflineDownloadActive,
  offlineDownloadLabel,
  subscribeOfflineDownload,
} from '@/lib/offline_download_job';
import Avatar, { PRESET_AVATARS, defaultAvatarId } from '@/components/Avatar';
import AppBodyPortal from '@/components/AppBodyPortal';
import { todayMinutes, dailyMinutes, bookProgressMap, buildReport } from '@/lib/reading';
import { readingStreak } from '@/lib/gamification';
import type { BadgeDef } from '@/lib/badges';
import { computeBadgesWithUnlock, profilePreviewBadges } from '@/lib/badge_unlock';
import { answerStats, dailyQuizDone } from '@/lib/daily_quiz';
import {
  dailyWarmupCta,
  dailyWarmupSubtitle,
  dailyWarmupTitle,
  reminderHeroSub,
  reminderHeroTitle,
} from '@/lib/beiai_habit_copy';
import {
  ensurePermission,
  getReminder,
  setReminder,
  type ReminderPref,
} from '@/lib/reminder';
import { checkPushReadiness, pushReadinessHint } from '@/lib/push_status';
import { isAutoBiblePackReady } from '@/lib/offline_pack';
import { listBibleThoughts } from '@/lib/reader_thoughts';
import {
  blobToDataUrl,
  clearCachedCustomAvatar,
  cropCompressAvatar,
  encodeCustomAvatarId,
  isCustomAvatarId,
  normalizeCustomAvatarId,
  setCachedCustomAvatar,
} from '@/lib/profile_avatar';
import {
  footprintHasNew,
  markFootprintSeen,
  markStreakMilestoneShared,
  pendingStreakMilestone,
  readFootprintSeen,
  type FootprintSeen,
} from '@/lib/profile_footprint';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { shareCardOutbound } from '@/lib/share_card';
import { clearAppCacheAndReload } from '@/lib/clear_app_cache';
import {
  clearAssistantTouchLocks,
  dismissOrphanBodySheetBackdrops,
  purgeShellTouchBlockers,
  softRecoverShellTouch,
} from '@/lib/sheet_overlay';
import { setShelfReaderChrome } from '@/lib/shelf_host';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { Pressable } from '@/components/ui/Pressable';
import { subscribeLocalDataChanged } from '@/lib/local_data_events';
import { getSyncState, subscribeSyncState, syncStateLabel } from '@/lib/sync_status';
import { syncNow } from '@/lib/sync';
import { pushProfileAvatar, pushProfileBio } from '@/lib/profile_sync';
import {
  accountDataStatus,
  canCloudSync,
  clearProfilePasswordNudge,
  hasProfilePasswordNudge,
  isAccountComplete,
} from '@/lib/account_guide';
import { markRouteNavigation, navigateAppHref, subscribePwaTabNav } from '@/lib/pwa_tab_nav';
import {
  PROFILE_SETTINGS_HREF,
  PROFILE_SETTINGS_LEGACY_QUERY,
} from '@/lib/profile_settings';
import { normalizeAppPath } from '@/lib/tab_keep_alive';
import { useTabKeepAlive } from '@/components/shell/TabKeepAliveContext';
import { plainThoughtPreview } from '@/lib/thought_display';
import { shareInviteProduct, inviteShareUrl } from '@/lib/invite_share';
import { buildTrackedUrl } from '@/lib/acquisition';
import { userLsGet, userLsSet } from '@/lib/user_storage';
import { getActivePlan, getPlanDay } from '@/lib/plan_progress';
import { activePlanTodayHrefSync } from '@/lib/plan_today_href';
import {
  listPlatformShelf,
  loadShelfLastRead,
  type ShelfBookSummary,
} from '@/lib/shelf_api';
import { peekShelfListCache } from '@/lib/shelf_cache';

const AVATAR_KEY = 'profile_avatar';
const BIO_KEY = 'profile_bio';
const SHORTCUT_KEY = 'presto_profile_shortcut';

type ShortcutTone = 'challenge' | 'remind' | 'offline' | 'cache';

const REMIND_SLOTS = [
  { key: 'morning', label: '晨读', hour: 7, minute: 0 },
  { key: 'noon', label: '午间', hour: 12, minute: 30 },
  { key: 'evening', label: '晚读', hour: 21, minute: 0 },
] as const;

function readStoredShortcut(): ShortcutTone {
  if (typeof window === 'undefined') return 'challenge';
  try {
    const v = sessionStorage.getItem(SHORTCUT_KEY);
    if (v === 'challenge' || v === 'remind' || v === 'offline' || v === 'cache') return v;
  } catch {
    /* ignore */
  }
  return 'challenge';
}

function formatRemindTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function ymdLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function weekMinutesTotal(): number {
  const logs = dailyMinutes();
  const now = new Date();
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    sum += logs[ymdLocal(d)] || 0;
  }
  return sum;
}

type FootprintTone = 'thought' | 'shelf' | 'badge' | 'journey';

function ProfileGlyph({
  name,
  size = 18,
}: {
  name: FootprintTone | ShortcutTone;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (name) {
    case 'thought':
      return (
        <svg {...common}>
          <path d="M12 19c-4.2 0-7.5-2.7-7.5-6S7.8 7 12 7s7.5 2.7 7.5 6c0 2-1.1 3.7-2.9 4.8L17 20l-3.2-1.1c-.6.1-1.2.1-1.8.1Z" />
          <path d="M9.5 11.5h5M9.5 14h3.2" />
        </svg>
      );
    case 'shelf':
      return (
        <svg {...common}>
          <path d="M4 19V6a2 2 0 0 1 2-2h4v15H6a2 2 0 0 0-2 2Z" />
          <path d="M20 19V6a2 2 0 0 0-2-2h-4v15h4a2 2 0 0 1 2 2Z" />
          <path d="M12 4v15" />
        </svg>
      );
    case 'badge':
      return (
        <svg {...common}>
          <circle cx="12" cy="10" r="5.5" />
          <path d="M9.2 14.8 8 20l4-1.8L16 20l-1.2-5.2" />
        </svg>
      );
    case 'journey':
      return (
        <svg {...common}>
          <circle cx="6.5" cy="17.5" r="2" />
          <circle cx="17.5" cy="6.5" r="2" />
          <path d="M8.2 16.2 15.8 7.8" />
        </svg>
      );
    case 'challenge':
      return (
        <svg {...common}>
          <path d="M9 4h6v3a3 3 0 0 1-6 0V4Z" />
          <path d="M8 7H6.5A2.5 2.5 0 0 0 4 9.5V11a4 4 0 0 0 4 4h.5" />
          <path d="M16 7h1.5A2.5 2.5 0 0 1 20 9.5V11a4 4 0 0 1-4 4h-.5" />
          <path d="M12 15v5M9.5 20h5" />
        </svg>
      );
    case 'remind':
      return (
        <svg {...common}>
          <path d="M6 16h12l-1.2-1.2A6 6 0 0 1 15 10V9a3 3 0 1 0-6 0v1a6 6 0 0 1-1.8 4.8L6 16Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'offline':
      return (
        <svg {...common}>
          <path d="M7 7h10v12H7z" />
          <path d="M10 4h4v3h-4zM9.5 11h5M9.5 14.5h5" />
        </svg>
      );
    case 'cache':
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="M8 7l1 12h6l1-12" />
        </svg>
      );
    default:
      return null;
  }
}

function FootprintCell({
  kind,
  tone,
  count,
  value,
  empty,
  isNew,
  adornment,
  hideValue,
  onOpen,
  onShare,
  beforeOpen,
}: {
  kind: string;
  tone: FootprintTone;
  count?: number;
  value: string;
  empty?: boolean;
  isNew?: boolean;
  adornment?: ReactNode;
  hideValue?: boolean;
  onOpen: () => void;
  onShare?: () => void;
  beforeOpen?: () => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startXY = useRef<{ x: number; y: number } | null>(null);
  const openedAt = useRef(0);
  const label = count && count > 0 ? `${kind} · ${count}` : kind;

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const clearTimer = () => {
    clearLongPressTimer();
    startXY.current = null;
  };

  const openOnce = () => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - openedAt.current < 450) return;
    openedAt.current = now;
    beforeOpen?.();
    onOpen();
  };

  return (
    <button
      type="button"
      className={`card profile-footprint-cell tone-${tone}${isNew ? ' has-new' : ''}${empty ? ' is-empty' : ''}`}
      role="listitem"
      title={onShare ? '长按可分享' : undefined}
      aria-label={isNew ? `${label}，有新内容` : label}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        longPressFired.current = false;
        clearTimer();
        startXY.current = { x: e.clientX, y: e.clientY };
        if (!onShare) {
          // 与设置一致：无长按分享时 pointerdown 立刻打开
          openOnce();
          return;
        }
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          longPressFired.current = true;
          try {
            navigator.vibrate?.(10);
          } catch {
            /* ignore */
          }
          onShare();
        }, 650);
      }}
      onPointerMove={(e) => {
        if (!startXY.current || !longPressTimer.current) return;
        const dx = Math.abs(e.clientX - startXY.current.x);
        const dy = Math.abs(e.clientY - startXY.current.y);
        // 滑动取消长按分享，但保留 startXY，避免 iOS pointerleave 后松手打不开
        if (dx > 12 || dy > 12) clearLongPressTimer();
      }}
      onPointerUp={(e) => {
        if (!onShare) {
          clearTimer();
          return;
        }
        const start = startXY.current;
        const fired = longPressFired.current;
        clearTimer();
        if (fired) {
          longPressFired.current = false;
          return;
        }
        if (!start) return;
        if (Math.abs(e.clientX - start.x) > 12 || Math.abs(e.clientY - start.y) > 12) return;
        openOnce();
      }}
      onPointerCancel={clearTimer}
      onPointerLeave={() => {
        // 只取消长按计时；勿清空 startXY（Safari 常在 pointerup 前发 leave）
        clearLongPressTimer();
      }}
      onContextMenu={(e) => {
        if (!onShare) return;
        e.preventDefault();
        longPressFired.current = true;
        onShare();
      }}
      onClick={() => {
        if (!onShare) return;
        if (longPressFired.current) {
          longPressFired.current = false;
          return;
        }
        openOnce();
      }}
    >
      {isNew ? <span className="profile-footprint-dot" aria-hidden /> : null}
      <span className="profile-footprint-label">
        <span className="profile-footprint-kind-row">
          <span className="profile-footprint-glyph" aria-hidden>
            <ProfileGlyph name={tone} size={17} />
          </span>
          <span className="profile-footprint-kind">{kind}</span>
        </span>
        {count && count > 0 ? (
          <span className="profile-footprint-count">{count}</span>
        ) : null}
      </span>
      <span className={`profile-footprint-body${hideValue ? ' is-adorn-only' : ''}`}>
        {hideValue ? null : (
          <strong className={`profile-footprint-value${empty ? ' is-empty' : ''}`}>{value}</strong>
        )}
        {adornment ? <span className="profile-footprint-adorn">{adornment}</span> : null}
      </span>
    </button>
  );
}

const AccountSecurityCard = dynamic(() => import('@/components/AccountSecurityCard'), { ssr: false });
const OfflineDownloadSheet = dynamic(() => import('@/components/OfflineDownloadSheet'), { ssr: false });
const ReadingProgress = dynamic(() => import('@/components/ReadingProgress'), { ssr: false });
const BadgeGallery = dynamic(() => import('@/components/BadgeGallery'), { ssr: false });

export default function ProfileTab({ paneActive = true }: { paneActive?: boolean }) {
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [gid, setGid] = useState<string>('');
  const [mins, setMins] = useState(0);
  const [idCopied, setIdCopied] = useState(false);
  const [avatarId, setAvatarId] = useState('a1');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadHint, setDownloadHint] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [dataStatus, setDataStatus] = useState<string | null>(null);
  const [bioEditing, setBioEditing] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [accountComplete, setAccountComplete] = useState(false);
  const [clearCacheBusy, setClearCacheBusy] = useState(false);
  const [streak, setStreak] = useState(0);
  const [weekMins, setWeekMins] = useState(0);
  const [journeyPct, setJourneyPct] = useState(0);
  const [journeyReadBooks, setJourneyReadBooks] = useState(0);
  const [thoughtCount, setThoughtCount] = useState(0);
  const [thoughtPreview, setThoughtPreview] = useState('');
  const [badgePreviewIcons, setBadgePreviewIcons] = useState<string[]>([]);
  const [badgeDoneCount, setBadgeDoneCount] = useState(0);
  const [shortcut, setShortcut] = useState<ShortcutTone>('challenge');
  const [dailyDone, setDailyDone] = useState(false);
  const [quizStats, setQuizStats] = useState(() => ({
    correct: 0,
    wrong: 0,
    total: 0,
    accuracyPct: 0,
  }));
  const [reminderPref, setReminderPref] = useState<ReminderPref>({
    enabled: false,
    hour: 8,
    minute: 0,
  });
  const [remindBusy, setRemindBusy] = useState(false);
  const [pushHint, setPushHint] = useState('');
  const [offlineReady, setOfflineReady] = useState(false);
  const [footprintSeen, setFootprintSeen] = useState<FootprintSeen>({
    thoughts: 0,
    shelf: 0,
    badges: 0,
  });
  const [milestone, setMilestone] = useState<number | null>(null);
  const [milestoneBusy, setMilestoneBusy] = useState(false);
  const [syncLabel, setSyncLabel] = useState(() =>
    typeof window !== 'undefined' ? syncStateLabel(getSyncState()) : '已同步到云端',
  );
  const [bookNames, setBookNames] = useState<Record<string, string>>({});
  const [shelfBooks, setShelfBooks] = useState<ShelfBookSummary[]>(() => peekShelfListCache(true)?.items ?? []);
  const [shelfPreview, setShelfPreview] = useState('');  const [badges, setBadges] = useState<BadgeDef[]>([]);
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const shortcutPanelRef = useRef<HTMLDivElement | null>(null);
  const bookNamesRef = useRef(bookNames);
  bookNamesRef.current = bookNames;

  const pathname = usePathname();
  const { enabled, activeTab } = useTabKeepAlive();
  const profileAwake = paneActive && (activeTab == null || activeTab === 'profile');

  /** 切回「我的」时卸透明吞点击层 / 孤悬 body class（非性能问题，是触摸锁残留） */
  const recoverProfileShellTouch = useCallback((hard = false) => {
    setShelfReaderChrome(false);
    if (hard) {
      purgeShellTouchBlockers();
      return;
    }
    softRecoverShellTouch();
    clearAssistantTouchLocks();
    dismissOrphanBodySheetBackdrops();
    if (typeof document !== 'undefined' && !document.querySelector('.external-browser')) {
      document.documentElement.classList.remove('external-browser-open');
      document.body.classList.remove('external-browser-open');
    }
  }, []);

  // 切走「我的」时收起全部 portal；切回时恢复触摸
  useEffect(() => {
    if (!paneActive) {
      setPickerOpen(false);
      setBadgeOpen(false);
      return;
    }
    recoverProfileShellTouch();
  }, [paneActive, recoverProfileShellTouch]);

  // 非安卓壳没有「缓存」Tab：若会话残留选中则回落离线
  useEffect(() => {
    if (shortcut !== 'cache' || isPeiaiAndroidShell()) return;
    setShortcut('offline');
    try {
      sessionStorage.setItem(SHORTCUT_KEY, 'offline');
    } catch {
      /* ignore */
    }
  }, [shortcut]);

  const consumeProfileQueryFlag = (flag: string): boolean => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get(flag) !== '1') return false;
    params.delete(flag);
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', next);
    return true;
  };

  const applyProfileDeepLinks = useCallback(() => {
    const onProfile = enabled
      ? activeTab === 'profile'
      : normalizeAppPath(pathname) === '/profile';
    if (!onProfile) return;
    if (consumeProfileQueryFlag(PROFILE_SETTINGS_LEGACY_QUERY) || consumeProfileQueryFlag('settings')) {
      navigateAppHref(PROFILE_SETTINGS_HREF, router);
      return;
    }
    if (consumeProfileQueryFlag('badges')) setBadgeOpen(true);
  }, [enabled, activeTab, pathname, router]);

  useEffect(() => {
    if (!profileAwake) return;
    const refreshHint = () => {
      if (!isOfflineDownloadActive()) {
        setDownloadHint(null);
      } else {
        setDownloadHint(offlineDownloadLabel(getOfflineDownloadSnapshot()));
      }
      void isAutoBiblePackReady().then(setOfflineReady).catch(() => setOfflineReady(false));
    };
    refreshHint();
    return subscribeOfflineDownload(refreshHint);
  }, [profileAwake]);

  useEffect(() => {
    setShortcut(readStoredShortcut());
  }, []);

  useEffect(() => {
    if (!profileAwake) return;
    const refreshShortcutData = () => {
      setDailyDone(dailyQuizDone());
      setQuizStats(answerStats());
      setReminderPref(getReminder());
    };
    refreshShortcutData();
    void checkPushReadiness().then((r) => {
      setPushHint(r.ok ? '' : pushReadinessHint(r));
    });
    return subscribeLocalDataChanged(refreshShortcutData);
  }, [profileAwake]);

  useEffect(() => {
    if (enabled) {
      if (activeTab !== 'profile') {
        setBadgeOpen(false);
      }
      return;
    }
    if (normalizeAppPath(pathname) !== '/profile') {
      setBadgeOpen(false);
    }
  }, [enabled, activeTab, pathname]);

  useEffect(() => {
    applyProfileDeepLinks();
  }, [applyProfileDeepLinks]);

  useEffect(() => {
    if (!enabled || !profileAwake) return;
    return subscribePwaTabNav(() => applyProfileDeepLinks());
  }, [enabled, profileAwake, applyProfileDeepLinks]);

  useEffect(() => {
    if (currentUserId() && canCloudSync()) {
      void import('@/lib/post_login').then((m) => m.mergeGuest());
      void syncNow().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!profileAwake) return;
    listPlatformShelf()
      .then((items) => {
        setShelfBooks(items);
        refreshFootprintLocal();
      })
      .catch(() => {
        setShelfBooks([]);
        refreshFootprintLocal();
      });
  }, [profileAwake]);

  // 弱网：预热「我的」常用二级页 chunk，减少首次点击空白窗
  useEffect(() => {
    if (!profileAwake) return;
    const paths = ['/notes', '/shelf', PROFILE_SETTINGS_HREF, '/report'] as const;
    const run = () => {
      for (const href of paths) {
        try {
          router.prefetch(href);
        } catch {
          /* ignore */
        }
      }
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run, { timeout: 2500 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 400);
    return () => window.clearTimeout(t);
  }, [profileAwake, router]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        await ensureAccountReady();
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      setUid(currentUserId());
      setGid(guestId());
      const saved = userLsGet(AVATAR_KEY);
      if (saved && isCustomAvatarId(saved)) {
        const normalized = normalizeCustomAvatarId(saved);
        if (normalized !== saved) {
          userLsSet(AVATAR_KEY, normalized);
          pushProfileAvatar(normalized);
        }
        setAvatarId(normalized);
      } else {
        setAvatarId(saved || defaultAvatarId(effectiveId() || undefined));
      }
      setName(getDisplayName());
      setBio(userLsGet(BIO_KEY) || '');
      setMins(todayMinutes());
      setWeekMins(weekMinutesTotal());
      setStreak(buildReport().monthDays);
      setAccountComplete(isAccountComplete());
      setFootprintSeen(readFootprintSeen());
      setMilestone(pendingStreakMilestone(readingStreak()));
      refreshFootprintLocal();
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadBadges = async () => {
      const list = await computeBadgesWithUnlock();
      if (cancelled) return;
      setBadges(list);
      const preview = profilePreviewBadges(list, 3);
      setBadgePreviewIcons(preview.map((b) => b.icon).filter(Boolean));
      setBadgeDoneCount(list.filter((b) => b.done).length);
    };
    void loadBadges();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .books()
      .then((d) => {
        if (cancelled) return;
        const names: Record<string, string> = {};
        const totals: Record<string, number> = {};
        for (const b of d.books) {
          names[b.id] = b.name;
          totals[b.id] = b.chapter_count;
        }
        setBookNames(names);
        const progress = bookProgressMap(totals);
        const totalBooks = d.books.length;
        const readBooks = Object.values(progress).filter(
          (p) => p.passes >= 1 || p.distinctChapters > 0,
        ).length;
        setJourneyReadBooks(readBooks);
        setJourneyPct(totalBooks > 0 ? Math.round((readBooks / totalBooks) * 100) : 0);
        refreshFootprintLocal();
      })
      .catch(() => {
        if (!cancelled) {
          setJourneyPct(0);
          setJourneyReadBooks(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshFootprintLocal = () => {
    const thoughts = listBibleThoughts();
    setThoughtCount(thoughts.length);
    setThoughtPreview(plainThoughtPreview(thoughts[0]?.body || '', 28));

    const books = peekShelfListCache(true)?.items ?? [];
    const last = loadShelfLastRead();
    if (last?.bookTitle) {
      setShelfPreview(last.bookTitle);
    } else if (books.length > 0) {
      setShelfPreview(`${books.length} 本`);
    } else {
      setShelfPreview('');
    }
  };

  useEffect(() => {
    if (!profileAwake) return;
    const refreshReading = () => {
      setMins(todayMinutes());
      setWeekMins(weekMinutesTotal());
      setStreak(buildReport().monthDays);
      setName(getDisplayName());
      setBio(userLsGet(BIO_KEY) || '');
      refreshFootprintLocal();
      void computeBadgesWithUnlock().then((list) => {
        setBadges(list);
        const preview = profilePreviewBadges(list, 3);
        setBadgePreviewIcons(preview.map((b) => b.icon).filter(Boolean));
        setBadgeDoneCount(list.filter((b) => b.done).length);
      });
      setFootprintSeen(readFootprintSeen());
      setMilestone(pendingStreakMilestone(readingStreak()));
      void api.books().then((d) => {
        const names: Record<string, string> = {};
        const totals: Record<string, number> = {};
        for (const b of d.books) {
          names[b.id] = b.name;
          totals[b.id] = b.chapter_count;
        }
        setBookNames(names);
        const progress = bookProgressMap(totals);
        const totalBooks = d.books.length;
        const readBooks = Object.values(progress).filter(
          (p) => p.passes >= 1 || p.distinctChapters > 0,
        ).length;
        setJourneyReadBooks(readBooks);
        setJourneyPct(totalBooks > 0 ? Math.round((readBooks / totalBooks) * 100) : 0);
        refreshFootprintLocal();
      }).catch(() => {});
    };
    const refreshStatus = () => {
      setDataStatus(accountDataStatus());
    };
    refreshStatus();
    refreshReading();
    const unsubSync = subscribeSyncState(() => {
      refreshStatus();
      setSyncLabel(
        canCloudSync() ? syncStateLabel(getSyncState()) : '需先设置密码',
      );
      if (getSyncState() === 'synced') refreshReading();
    });
    setSyncLabel(
      canCloudSync() ? syncStateLabel(getSyncState()) : '需先设置密码',
    );
    const unsubData = subscribeLocalDataChanged(refreshReading);
    return () => {
      unsubSync();
      unsubData();
    };
  }, [profileAwake]);

  const refreshAccount = () => {
    setName(getDisplayName());
    setAccountComplete(isAccountComplete());
    setDataStatus(accountDataStatus());
    setSyncLabel(
      canCloudSync() ? syncStateLabel(getSyncState()) : '需先设置密码',
    );
    if (hasPassword()) clearProfilePasswordNudge();
  };
  const saveBio = (v: string) => {
    const t = v.slice(0, 15);
    setBio(t);
    userLsSet(BIO_KEY, t);
    pushProfileBio(t);
  };

  const beginEditName = () => {
    const cur = (getUserName() || '').trim();
    // 系统名/空名：留空方便自设，避免用户以为必须改一两个字
    setNameDraft(
      !cur || isSystemGeneratedUsername(cur) ? '' : cur,
    );
    setNameEditing(true);
    setBioEditing(false);
  };

  const saveDisplayName = async () => {
    const u = nameDraft.trim();
    if (u.length < 2) {
      toast('称呼至少 2 个字');
      return;
    }
    setNameBusy(true);
    try {
      const next = await changeUsername(u);
      setName(next);
      setNameEditing(false);
      toast('称呼已保存');
      refreshAccount();
    } catch (e) {
      toast(e instanceof Error ? e.message : '改名失败');
    } finally {
      setNameBusy(false);
    }
  };

  const chooseAvatar = (id: string) => {
    clearCachedCustomAvatar();
    setAvatarId(id);
    userLsSet(AVATAR_KEY, id);
    pushProfileAvatar(id);
    setPickerOpen(false);
  };

  const onPickCustomAvatar = async (file: File | null) => {
    if (!file || avatarUploading) return;
    if (!file.type.startsWith('image/')) {
      toast('请选择图片文件');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast('图片过大，请选择 12MB 以内的照片');
      return;
    }
    const prevId = avatarId;
    setAvatarUploading(true);
    try {
      const blob = await cropCompressAvatar(file, 512, 0.82);
      const dataUrl = await blobToDataUrl(blob);
      setCachedCustomAvatar(dataUrl);
      // 先本地预览（data URL），上传成功后再换成持久 key
      const previewId = encodeCustomAvatarId(dataUrl);
      setAvatarId(previewId);
      const uploadFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const meta = await api.uploadProfileAvatar(uploadFile);
      const durable =
        meta.avatar_id
        || (meta.storage_key ? encodeCustomAvatarId(meta.storage_key) : '');
      if (!durable) throw new Error('上传成功但未返回地址');
      const nextId = encodeCustomAvatarId(durable);
      setAvatarId(nextId);
      userLsSet(AVATAR_KEY, nextId);
      pushProfileAvatar(nextId);
      void syncNow().catch(() => {});
      setPickerOpen(false);
      toast('头像已更新');
    } catch (e) {
      clearCachedCustomAvatar();
      const saved = userLsGet(AVATAR_KEY);
      setAvatarId(saved || prevId || defaultAvatarId(effectiveId() || undefined));
      toast(e instanceof Error ? `${e.message} · 已恢复原头像` : '头像上传失败 · 已恢复原头像');
    } finally {
      setAvatarUploading(false);
      if (avatarFileRef.current) avatarFileRef.current.value = '';
    }
  };

  const idValue = uid || gid;

  const copyId = async () => {
    if (!idValue) return;
    try {
      await navigator.clipboard.writeText(idValue);
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  const handleClearCache = async () => {
    if (clearCacheBusy) return;
    const ok = await confirm({
      title: '清除缓存',
      message: '将清除页面与离线缓存并刷新应用，不会删除你的读经记录、笔记与账号登录状态。',
      confirmLabel: '清除并刷新',
    });
    if (!ok) return;
    setClearCacheBusy(true);
    try {
      await clearAppCacheAndReload();
    } catch {
      setClearCacheBusy(false);
      toast('清除失败，请尝试在浏览器设置中清除站点数据后重开');
    }
  };

  const inviteFriends = async () => {
    toast('正在准备分享…');
    const result = await shareInviteProduct();
    if (result === 'shared') toast('已调起分享');
    else if (result === 'copied') toast('邀请文案与链接已复制');
    else if (result === 'failed') toast('分享失败');
  };

  const displayName = getDisplayName() || name.trim() || '读经伙伴';

  const shareMilestone = async () => {
    if (!milestone || milestoneBusy) return;
    setMilestoneBusy(true);
    try {
      const shareUrl = buildTrackedUrl('/share/app', {
        l1: 'share',
        l2: 'system_share',
        l3: `streak:${milestone}`,
      });
      const result = await shareCardOutbound({
        title: `已同行 ${milestone} 天`,
        subtitle: displayName,
        body: `在${BRAND_NAME}安静读经，一天又一天。愿话语继续同行。`,
        footer: `${BRAND_NAME} · ${BRAND_TAGLINE}`,
        badge: '读经同行',
        day: Math.min(milestone, 28),
        shareTitle: `已同行 ${milestone} 天｜${BRAND_NAME}`,
        shareText: `我在${BRAND_NAME}已同行读经 ${milestone} 天。愿话语继续同行。`,
        shareUrl,
        allowDownload: false,
      });
      if (result === 'shared' || result === 'copied' || result === 'downloaded') {
        markStreakMilestoneShared(milestone);
        setMilestone(null);
        toast(
          result === 'copied'
            ? '文案已复制'
            : result === 'downloaded'
              ? '分享图已保存'
              : '已调起分享',
        );
      } else if (result === 'failed') {
        toast('分享失败');
      }
    } finally {
      setMilestoneBusy(false);
    }
  };

  const dismissMilestone = () => {
    if (!milestone) return;
    markStreakMilestoneShared(milestone);
    setMilestone(null);
  };

  const openThoughts = () => {
    markFootprintSeen('thoughts', thoughtCount);
    setFootprintSeen(readFootprintSeen());
    navigateAppHref('/notes', router);
  };

  const openShelf = () => {
    markFootprintSeen('shelf', shelfBooks.length);
    setFootprintSeen(readFootprintSeen());
    navigateAppHref('/shelf', router);
  };

  /** 开层 / 跳转前硬卸吞点击遮罩，避免 PWA 上「点了没反应」 */
  const clearBlockingOverlays = () => {
    recoverProfileShellTouch(false);
  };

  const openSettings = () => {
    navigateAppHref(PROFILE_SETTINGS_HREF, router);
  };

  const openBadges = () => {
    markFootprintSeen('badges', badgeDoneCount);
    setFootprintSeen(readFootprintSeen());
    setBadgeOpen(true);
  };

  const selectShortcut = (next: ShortcutTone) => {
    setShortcut(next);
    try {
      sessionStorage.setItem(SHORTCUT_KEY, next);
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      const panel = shortcutPanelRef.current;
      const tabbar = document.querySelector<HTMLElement>('.tabbar');
      if (!panel || !tabbar) return;
      const panelBottom = panel.getBoundingClientRect().bottom;
      const tabTop = tabbar.getBoundingClientRect().top;
      if (panelBottom > tabTop - 12) {
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  };

  const openWarmupHub = () => {
    navigateAppHref('/challenge', router);
  };

  const startDailyQuiz = () => {
    navigateAppHref('/challenge?start=daily', router);
  };

  const applyRemindSlot = async (hour: number, minute: number) => {
    if (remindBusy) return;
    setRemindBusy(true);
    try {
      const ok = await ensurePermission();
      if (!ok) {
        toast('请在浏览器或系统设置中允许通知');
        return;
      }
      const next = { enabled: true, hour, minute };
      setReminder(next);
      setReminderPref(next);
      toast(`已设为每天 ${formatRemindTime(hour, minute)}`);
    } finally {
      setRemindBusy(false);
    }
  };

  const toggleReminder = async (enabled: boolean) => {
    if (remindBusy) return;
    setRemindBusy(true);
    try {
      if (enabled) {
        const ok = await ensurePermission();
        if (!ok) {
          toast('请在浏览器或系统设置中允许通知');
          return;
        }
      }
      const next = { ...reminderPref, enabled };
      setReminder(next);
      setReminderPref(next);
      toast(enabled ? '已开启读经提醒' : '已关闭读经提醒');
    } finally {
      setRemindBusy(false);
    }
  };

  const shareThoughtPreview = async () => {
    if (!thoughtPreview) return;
    const shareUrl = inviteShareUrl(effectiveId());
    const result = await shareCardOutbound({
      title: '我的笔记',
      subtitle: displayName,
      body: thoughtPreview,
      footer: `${BRAND_NAME} · ${BRAND_TAGLINE}`,
      badge: '笔记',
      day: 5,
      shareTitle: `我的笔记｜${BRAND_NAME}`,
      shareText: thoughtPreview,
      shareUrl,
      allowDownload: false,
    });
    if (result === 'shared') toast('已调起分享');
    else if (result === 'copied') toast('已复制');
    else if (result === 'failed') toast('分享失败');
  };

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
  const thoughtNew = footprintHasNew('thoughts', thoughtCount, footprintSeen);
  const shelfNew = footprintHasNew('shelf', shelfBooks.length, footprintSeen);
  const badgeNew = footprintHasNew('badges', badgeDoneCount, footprintSeen);

  return (
    <main className="container profile-page">
      <header className="profile-head profile-greet-head">
        <div className="profile-head-top">
          <div className="profile-head-actions">
            <Pressable
              className="icon-btn profile-head-icon-btn"
              aria-label="分享 App，邀请朋友一起读"
              softRecover
              beforePointerTap={clearBlockingOverlays}
              onTap={() => void inviteFriends()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.59 13.51 15.42 17.49" />
                <path d="M15.41 6.51 8.59 10.49" />
              </svg>
            </Pressable>
            <Pressable
              className="icon-btn profile-head-icon-btn"
              aria-label="设置"
              softRecover
              beforePointerTap={clearBlockingOverlays}
              onTap={() => openSettings()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Pressable>
          </div>
        </div>

        <div className="profile-identity">
          <Pressable
            className={`profile-avatar-btn${avatarUploading ? ' is-uploading' : ''}`}
            softRecover
            beforePointerTap={clearBlockingOverlays}
            onTap={() => setPickerOpen(true)}
            aria-label="更换头像"
            disabled={avatarUploading}
          >
            <Avatar id={avatarId} size={68} />
            {avatarUploading ? <span className="profile-avatar-spin" aria-hidden /> : null}
          </Pressable>
          <div className="profile-meta">
            {nameEditing ? (
              <div className="profile-name-edit-wrap">
                <input
                  className="book-chip profile-name-input"
                  value={nameDraft}
                  maxLength={24}
                  disabled={nameBusy}
                  autoFocus
                  placeholder="怎么称呼你？"
                  aria-label="编辑称呼"
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void saveDisplayName();
                    }
                    if (e.key === 'Escape') setNameEditing(false);
                  }}
                />
                <div className="profile-name-edit-actions">
                  <button
                    type="button"
                    className="font-pill"
                    disabled={nameBusy}
                    onClick={() => void saveDisplayName()}
                  >
                    {nameBusy ? '…' : '保存'}
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    disabled={nameBusy}
                    onClick={() => setNameEditing(false)}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="profile-name-hit"
                onClick={beginEditName}
                aria-label="编辑称呼"
              >
                <strong className="profile-display-name">{displayName}</strong>
                {displayNameHint(getUserName()) ? (
                  <span className="muted profile-name-hint">{displayNameHint(getUserName())}</span>
                ) : null}
              </button>
            )}
            {dataStatus ? (
              <p className="muted profile-data-status">{dataStatus}</p>
            ) : null}
            {bioEditing ? (
              <div className="profile-bio-edit-wrap">
                <input
                  className="book-chip profile-bio-input"
                  placeholder="一句话签名（≤15 字）"
                  value={bio}
                  maxLength={15}
                  autoFocus
                  onChange={(e) => saveBio(e.target.value)}
                  onBlur={() => setBioEditing(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setBioEditing(false);
                  }}
                />
                <span className="muted profile-bio-count">{bio.length}/15</span>
              </div>
            ) : (
              <button
                type="button"
                className="profile-bio-edit"
                onClick={() => setBioEditing(true)}
                aria-label="编辑签名"
              >
                <span className={`profile-bio-text${bio.trim() ? '' : ' is-empty'}`}>
                  {bio.trim() ? bio : '点击添加签名'}
                </span>
              </button>
            )}
            {idValue ? (
              <p className="profile-meta-line muted">
                <button type="button" className="profile-id-inline" onClick={() => void copyId()}>
                  {idCopied ? '已复制' : `ID ${idValue}`}
                </button>
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {accountComplete ? null : (
        <div
          className={`profile-account-secure${hasProfilePasswordNudge() ? ' is-nudge' : ''}`}
        >
          <AccountSecurityCard
            onComplete={() => {
              clearProfilePasswordNudge();
              refreshAccount();
            }}
          />
        </div>
      )}

      <div className="profile-companion-wrap">
        <Link
          href="/report"
          className="card profile-companion-card"
          onClick={(e) => {
            e.preventDefault();
            clearBlockingOverlays();
            markRouteNavigation();
            navigateAppHref('/report', router);
          }}
          aria-label={
            streak > 0
              ? `本月已读 ${streak} 天，今日 ${mins} 分钟，通读 ${journeyPct}%，打开同行读经`
              : `开始同行读经，今日 ${mins} 分钟，通读 ${journeyPct}%`
          }
        >
          <div className="profile-companion-main">
            {streak > 0 ? (
              <strong className="profile-companion-title">
                <span className="profile-companion-kicker">本月已读</span>
                <span className="profile-companion-days">
                  <span className="profile-companion-num">{streak}</span>
                  <span className="profile-companion-unit">天</span>
                </span>
              </strong>
            ) : (
              <strong className="profile-companion-title profile-companion-title-empty">
                开始同行读经
              </strong>
            )}
            <span className="muted profile-companion-sub">
              今日 {mins} 分钟 · 本周 {weekMins} 分钟
            </span>
          </div>
          <div className="profile-companion-ring" aria-hidden>
            {/* SVG 圆环：WebView 对 conic-gradient/color-mix 支持不稳 */}
            <svg
              className="profile-companion-ring-svg"
              viewBox="0 0 36 36"
              width="74"
              height="74"
            >
              <circle
                className="profile-companion-ring-track"
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                strokeWidth="3.2"
              />
              <circle
                className="profile-companion-ring-arc"
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, Math.min(100, journeyPct)) * 0.973}, 100`}
                transform="rotate(-90 18 18)"
              />
            </svg>
            <span className="profile-companion-ring-pct">
              <span className="profile-companion-ring-num">{journeyPct}</span>
              <span className="profile-companion-ring-unit">%</span>
            </span>
          </div>
        </Link>

        {milestone ? (
          <div className="profile-milestone-strip">
            <span className="profile-milestone-copy">
              同行 {milestone} 天 · 可分享这一刻
            </span>
            <div className="profile-milestone-actions">
              <button
                type="button"
                className="text-link profile-milestone-share"
                disabled={milestoneBusy}
                onClick={() => void shareMilestone()}
              >
                {milestoneBusy ? '…' : '分享'}
              </button>
              <button
                type="button"
                className="text-link muted"
                disabled={milestoneBusy}
                onClick={dismissMilestone}
              >
                稍后
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <p className="section-label tab-section-label profile-block-label">我的足迹</p>
      <div className="profile-footprint-grid" role="list">
        <FootprintCell
          // 足迹入口统一用用户可理解的「笔记」；底层仍复用经文想法数据。
          kind="笔记"
          tone="thought"
          count={thoughtCount}
          value={thoughtPreview || '写下第一句'}
          empty={!thoughtPreview}
          isNew={thoughtNew}
          beforeOpen={clearBlockingOverlays}
          onOpen={openThoughts}
          onShare={thoughtPreview ? () => void shareThoughtPreview() : undefined}
        />
        <FootprintCell
          kind="书架"
          tone="shelf"
          count={shelfBooks.length > 0 ? shelfBooks.length : undefined}
          value={shelfPreview || '打开书架'}
          empty={!shelfPreview}
          isNew={shelfNew}
          beforeOpen={clearBlockingOverlays}
          onOpen={openShelf}
        />
        <FootprintCell
          kind="成就"
          tone="badge"
          count={badgeDoneCount}
          value={badgeDoneCount > 0 ? '' : '去解锁第一枚'}
          hideValue={badgeDoneCount > 0}
          empty={badgeDoneCount === 0}
          isNew={badgeNew}
          beforeOpen={clearBlockingOverlays}
          onOpen={openBadges}
          adornment={
            badgePreviewIcons.length > 0 ? (
              <span className="profile-footprint-badge-stack" aria-hidden>
                {badgePreviewIcons.map((icon, i) => (
                  <span
                    key={`${icon}-${i}`}
                    className="profile-footprint-badge-thumb badge-circle badge-done"
                  >
                    {icon}
                  </span>
                ))}
              </span>
            ) : (
              <span className="profile-footprint-badge-thumb is-empty" aria-hidden>
                <ProfileGlyph name="badge" size={18} />
              </span>
            )
          }
        />
        {(() => {
          const active = getActivePlan();
          const day = active ? getPlanDay(active.planId) : 0;
          if (active) {
            const preview = `${active.title} · 第 ${Math.max(1, day)} / ${active.days} 天`;
            return (
              <FootprintCell
                kind="进行中"
                tone="journey"
                value={preview}
                empty={false}
                beforeOpen={clearBlockingOverlays}
                onOpen={() => {
                  navigateAppHref(activePlanTodayHrefSync(active), router);
                }}
              />
            );
          }
          return (
            <div
              className={`profile-footprint-cell profile-footprint-cell-progress tone-journey${journeyPct > 0 ? '' : ' is-empty'}`}
              role="listitem"
            >
              <ReadingProgress
                variant="footprint"
                summary={
                  journeyPct > 0
                    ? `通读 ${journeyPct}% · ${journeyReadBooks} 卷`
                    : undefined
                }
              />
            </div>
          );
        })()}
      </div>

      <p className="section-label tab-section-label profile-block-label">常用</p>
      <div
        className={`profile-shortcut-block${isPeiaiAndroidShell() ? ' has-cache-tab' : ''}`}
      >
        <div className="profile-shortcut-tabs" role="tablist" aria-label="常用">
          {(
            [
              { id: 'challenge' as const, label: dailyWarmupTitle() },
              { id: 'remind' as const, label: '提醒' },
              { id: 'offline' as const, label: '离线' },
              ...(isPeiaiAndroidShell()
                ? [{ id: 'cache' as const, label: '缓存' }]
                : []),
            ] as const
          ).map((tab) => (
            <Pressable
              key={tab.id}
              role="tab"
              aria-selected={shortcut === tab.id}
              className={`profile-shortcut-tab tone-${tab.id}${shortcut === tab.id ? ' is-active' : ''}`}
              onTap={() => selectShortcut(tab.id)}
            >
              <span className="profile-shortcut-tab-glyph" aria-hidden>
                <ProfileGlyph name={tab.id} size={18} />
              </span>
              <strong>{tab.label}</strong>
            </Pressable>
          ))}
        </div>

        <div
          ref={shortcutPanelRef}
          className={`card profile-shortcut-panel tone-${shortcut}`}
          role="tabpanel"
          aria-label={
            shortcut === 'challenge'
              ? dailyWarmupTitle()
              : shortcut === 'remind'
                ? '提醒'
                : shortcut === 'cache'
                  ? '清除缓存'
                  : '离线'
          }
        >
          {shortcut === 'challenge' ? (
            <>
              <div className="profile-shortcut-panel-head">
                <p className="profile-shortcut-panel-title">
                  {dailyWarmupSubtitle(dailyDone)}
                </p>
                <p className="profile-shortcut-panel-sub">
                  {quizStats.total > 0
                    ? `曾温习 ${quizStats.total} 题 · 错题会优先出现`
                    : '五道轻问，巩固读过的经文；不是考试'}
                </p>
              </div>
              <div className="profile-shortcut-panel-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={dailyDone ? openWarmupHub : startDailyQuiz}
                >
                  {dailyWarmupCta(dailyDone)}
                </button>
                <Link
                  href="/challenge"
                  className="text-link"
                  onClick={() => markRouteNavigation()}
                >
                  温习页 ›
                </Link>
              </div>
            </>
          ) : null}

          {shortcut === 'remind' ? (
            <>
              <div className="profile-shortcut-panel-head">
                <p className="profile-shortcut-panel-title">
                  {reminderHeroTitle(
                    reminderPref.enabled,
                    formatRemindTime(reminderPref.hour, reminderPref.minute),
                  )}
                </p>
                <p className="profile-shortcut-panel-sub">
                  {reminderHeroSub(reminderPref.enabled)}
                </p>
                {pushHint ? (
                  <p className="profile-shortcut-panel-hint">{pushHint}</p>
                ) : null}
              </div>
              <div className="profile-shortcut-slots" role="group" aria-label="提醒时段">
                {REMIND_SLOTS.map((slot) => {
                  const active =
                    reminderPref.enabled &&
                    reminderPref.hour === slot.hour &&
                    reminderPref.minute === slot.minute;
                  return (
                    <button
                      key={slot.key}
                      type="button"
                      className={`profile-shortcut-slot${active ? ' is-active' : ''}`}
                      disabled={remindBusy}
                      onClick={() => void applyRemindSlot(slot.hour, slot.minute)}
                    >
                      {slot.label}
                    </button>
                  );
                })}
              </div>
              <div className="profile-shortcut-panel-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={remindBusy}
                  onClick={() => void toggleReminder(!reminderPref.enabled)}
                >
                  {reminderPref.enabled ? '关闭提醒' : '开启提醒'}
                </button>
                <Link
                  href="/profile/reminders"
                  className="text-link"
                  onClick={() => markRouteNavigation()}
                >
                  提醒与勿扰 ›
                </Link>
              </div>
            </>
          ) : null}

          {shortcut === 'offline' ? (
            <>
              <div className="profile-shortcut-panel-head">
                <p className="profile-shortcut-panel-title">
                  {downloadHint
                    ? '正在下载'
                    : offlineReady
                      ? '和合本已就绪'
                      : '离线圣经未下载'}
                </p>
                <p className="profile-shortcut-panel-sub">
                  {downloadHint ||
                    (offlineReady
                      ? '可在无网时继续读经；也可管理其他译本与资料'
                      : '下载后无网也能读；资料包可按需管理')}
                </p>
              </div>
              <div className="profile-shortcut-panel-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDownloadOpen(true)}
                >
                  {downloadHint ? '查看进度' : offlineReady ? '管理离线包' : '下载离线包'}
                </button>
              </div>
            </>
          ) : null}

          {shortcut === 'cache' && isPeiaiAndroidShell() ? (
            <>
              <div className="profile-shortcut-panel-head">
                <p className="profile-shortcut-panel-title">
                  {clearCacheBusy ? '正在清除…' : '页面异常时可清除缓存'}
                </p>
                <p className="profile-shortcut-panel-sub">
                  清除页面与离线缓存并刷新；读经记录、笔记与账号登录不会删除。壁纸不显示、点击无反应时优先试这个。
                </p>
              </div>
              <div className="profile-shortcut-panel-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={clearCacheBusy}
                  onClick={() => void handleClearCache()}
                >
                  {clearCacheBusy ? '清除中…' : '清除缓存并刷新'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <p className="profile-brand-foot muted">
        {BRAND_NAME} · {BRAND_TAGLINE}
      </p>

      {badgeOpen && (
        <BadgeGallery badges={badges} onClose={() => setBadgeOpen(false)} />
      )}


      {downloadOpen ? (
        <OfflineDownloadSheet onClose={() => setDownloadOpen(false)} />
      ) : null}

      {pickerOpen && (
        <AppBodyPortal onTabAway={() => !avatarUploading && setPickerOpen(false)}>
          <div
            className="sheet-backdrop"
            onClick={() => !avatarUploading && setPickerOpen(false)}
            data-dismiss-on-tab-nav
          >
            <div
              className="sheet card avatar-picker-sheet"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="avatar-picker-title"
            >
              <h3 id="avatar-picker-title" style={{ marginTop: 0 }}>选择头像</h3>
              <div className="avatar-picker-current">
                <Avatar id={avatarId} size={64} />
                <div className="avatar-picker-current-text">
                  <strong>{isCustomAvatarId(avatarId) ? '当前：自定义' : '当前：系统预设'}</strong>
                  <span className="muted">默认预设 · 也可从相册上传</span>
                </div>
              </div>

              <div className="avatar-picker-actions">
                <button
                  type="button"
                  className="btn avatar-picker-upload-btn"
                  disabled={avatarUploading}
                  onClick={() => avatarFileRef.current?.click()}
                >
                  {avatarUploading ? '上传中…' : '从相册选择'}
                </button>
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    void onPickCustomAvatar(f);
                  }}
                />
              </div>

              <p className="muted avatar-picker-presets-label">
                {PRESET_AVATARS.length} 款预设插画
              </p>
              <div className="avatar-grid">
                {PRESET_AVATARS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`avatar-cell ${!isCustomAvatarId(avatarId) && a.id === avatarId ? 'avatar-cell-active' : ''}`}
                    title={a.label}
                    aria-pressed={!isCustomAvatarId(avatarId) && a.id === avatarId}
                    disabled={avatarUploading}
                    onClick={() => chooseAvatar(a.id)}
                  >
                    <span className="avatar-cell-frame">
                      <Avatar id={a.id} size={44} />
                      {!isCustomAvatarId(avatarId) && a.id === avatarId ? (
                        <span className="avatar-cell-check" aria-hidden>✓</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </AppBodyPortal>
      )}

    </main>
  );
}
