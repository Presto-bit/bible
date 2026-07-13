'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  currentUserId,
  effectiveId,
  ensureAccountReady,
  guestId,
  hasPassword,
  logout,
} from '@/lib/api';
import Avatar, { PRESET_AVATARS, defaultAvatarId } from '@/components/Avatar';
import AccountSecurityCard from '@/components/AccountSecurityCard';
import AccountSettingsSection from '@/components/AccountSettingsSection';
import SyncStatusBadge from '@/components/SyncStatusBadge';
import OfflineDownloadSheet from '@/components/OfflineDownloadSheet';
import ReadingProgress from '@/components/ReadingProgress';
import BadgeGallery from '@/components/BadgeGallery';
import { todayMinutes } from '@/lib/reading';
import { readingStreak } from '@/lib/gamification';
import type { BadgeDef } from '@/lib/badges';
import { computeBadgesWithUnlock, profilePreviewBadges } from '@/lib/badge_unlock';
import { favoriteReviewCards } from '@/lib/favorite_review';
import { recordMemoryReview } from '@/lib/badge_events';
import { clearAppCacheAndReload } from '@/lib/clear_app_cache';
import { SheetCloseButton } from '@/components/PageBackBar';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { subscribeLocalDataChanged } from '@/lib/local_data_events';
import { getSyncState, subscribeSyncState } from '@/lib/sync_status';
import { syncNow } from '@/lib/sync';
import { pushProfileAvatar } from '@/lib/profile_sync';
import { isAccountComplete } from '@/lib/account_guide';
import { fetchAdminEligible } from '@/lib/admin_rag';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import {
  PROFILE_SETTINGS_BACK_LABEL,
  PROFILE_SETTINGS_HREF,
} from '@/lib/profile_settings';
import { normalizeAppPath } from '@/lib/tab_keep_alive';
import { useTabKeepAlive } from '@/components/shell/TabKeepAliveContext';
import { subscribePwaTabNav } from '@/lib/pwa_tab_nav';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { isStandalonePwa } from '@/lib/platform';

const AVATAR_KEY = 'profile_avatar';
const NAME_KEY = 'profile_name';
const BIO_KEY = 'profile_bio';

export default function ProfileTab() {
  const confirm = useConfirm();
  const toast = useToast();
  const [uid, setUid] = useState<string | null>(null);
  const [gid, setGid] = useState<string>('');
  const [mins, setMins] = useState(0);
  const [idCopied, setIdCopied] = useState(false);
  const [avatarId, setAvatarId] = useState('a1');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [bioEditing, setBioEditing] = useState(false);
  const [accountComplete, setAccountComplete] = useState(false);
  const [clearCacheBusy, setClearCacheBusy] = useState(false);
  const [hasPwd, setHasPwd] = useState(false);
  const [reviewCards, setReviewCards] = useState<{ ref: string; label: string }[]>([]);
  const [streak, setStreak] = useState(0);
  const [badges, setBadges] = useState<BadgeDef[]>([]);
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [adminEligible, setAdminEligible] = useState(false);
  const [installedPwa, setInstalledPwa] = useState(
    () => typeof window !== 'undefined' && isStandalonePwa(),
  );

  const pathname = usePathname();
  const { enabled, activeTab } = useTabKeepAlive();

  const openSettingsRoute = () => {
    markRouteNavigation();
  };

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
    if (consumeProfileQueryFlag('settings')) setSettingsOpen(true);
    if (consumeProfileQueryFlag('badges')) setBadgeOpen(true);
  }, [enabled, activeTab, pathname]);

  useEffect(() => {
    if (enabled) {
      if (activeTab !== 'profile') {
        setSettingsOpen(false);
        setBadgeOpen(false);
      }
      return;
    }
    if (normalizeAppPath(pathname) !== '/profile') {
      setSettingsOpen(false);
      setBadgeOpen(false);
    }
  }, [enabled, activeTab, pathname]);

  useEffect(() => {
    applyProfileDeepLinks();
  }, [applyProfileDeepLinks]);

  useEffect(() => {
    if (!enabled) return;
    return subscribePwaTabNav(() => applyProfileDeepLinks());
  }, [enabled, applyProfileDeepLinks]);

  useEffect(() => {
    if (!uid) {
      setAdminEligible(false);
      return;
    }
    void fetchAdminEligible().then(setAdminEligible);
  }, [uid, settingsOpen]);

  useEffect(() => {
    setReviewCards(favoriteReviewCards(3));
  }, []);

  useEffect(() => {
    if (currentUserId()) {
      void import('@/lib/post_login').then((m) => m.mergeGuest());
      void syncNow().catch(() => {});
    }
  }, []);

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
      const saved = localStorage.getItem(AVATAR_KEY);
      setAvatarId(saved || defaultAvatarId(effectiveId() || undefined));
      setName(localStorage.getItem(NAME_KEY) || '');
      setBio(localStorage.getItem(BIO_KEY) || '');
      setMins(todayMinutes());
      setStreak(readingStreak());
      setHasPwd(hasPassword());
      setAccountComplete(isAccountComplete());
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
    };
    void loadBadges();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refreshReading = () => {
      setMins(todayMinutes());
      setStreak(readingStreak());
      void computeBadgesWithUnlock().then(setBadges);
    };
    const unsubSync = subscribeSyncState(() => {
      if (getSyncState() === 'synced') refreshReading();
    });
    const unsubData = subscribeLocalDataChanged(refreshReading);
    return () => {
      unsubSync();
      unsubData();
    };
  }, []);

  const refreshAccount = () => {
    setName(localStorage.getItem(NAME_KEY) || '');
    setHasPwd(hasPassword());
    setAccountComplete(isAccountComplete());
  };
  const saveBio = (v: string) => {
    const t = v.slice(0, 15);
    setBio(t);
    localStorage.setItem(BIO_KEY, t);
  };

  const chooseAvatar = (id: string) => {
    setAvatarId(id);
    localStorage.setItem(AVATAR_KEY, id);
    pushProfileAvatar(id);
    setPickerOpen(false);
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

  const displayName = name.trim() || '读经伙伴';
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

  return (
    <main className="container profile-page">
      <header className="profile-head profile-greet-head">
        <button
          type="button"
          className="profile-avatar-btn"
          onClick={() => setPickerOpen(true)}
          aria-label="更换头像"
        >
          <Avatar id={avatarId} size={56} />
        </button>
        <div className="profile-meta">
          <div className="profile-name-row">
            <strong className="profile-display-name">{displayName}</strong>
            <SyncStatusBadge />
          </div>
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
              <span className="muted" style={{ fontSize: 11 }}>{bio.length}/15</span>
            </div>
          ) : (
            <button
              type="button"
              className="profile-bio-edit"
              onClick={() => setBioEditing(true)}
              aria-label="编辑签名"
            >
              <span className="muted profile-bio-text">
                {bio.trim() ? bio : '点击添加签名'}
              </span>
            </button>
          )}
          <p className="profile-meta-line muted">
            {streak > 0 ? `连续 ${streak} 天` : '开始连续读经'}
            {idValue && !accountComplete ? (
              <>
                {' · '}
                <button type="button" className="profile-id-inline" onClick={() => void copyId()}>
                  {idCopied ? '已复制' : `ID ${idValue}`}
                </button>
              </>
            ) : null}
            {hasPwd ? ' · 已设密码' : ' · 建议设置用户名'}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn profile-settings-btn"
          aria-label="设置"
          onClick={() => setSettingsOpen(true)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      {!accountComplete ? (
        <AccountSecurityCard onComplete={refreshAccount} />
      ) : null}

      <p className="section-label tab-section-label profile-block-label">成长</p>
      <div className="profile-soft-stack">
        <Link href="/report" className="card row-card home-list-row home-list-row-wrap profile-soft-row">
          <span className="pill pill-active">成长</span>
          <span className="home-list-main">
            <strong className="profile-streak-title">
              {streak > 0 ? `连续 ${streak} 天` : '读经回顾'}
              {' · '}
              今日 {mins} 分钟
            </strong>
            <span className="muted home-list-sub">读经回顾 ›</span>
          </span>
          <span className="muted home-list-chevron">›</span>
        </Link>

        <button
          type="button"
          className="card profile-badge-card"
          onClick={() => setBadgeOpen(true)}
        >
          <div className="profile-badge-card-head">
            <span className="profile-badge-card-title">成就</span>
            <span className="muted">
              {badges.length
                ? `已收集 ${badges.filter((b) => b.done).length}/${badges.length} ›`
                : '查看全部 ›'}
            </span>
          </div>
          <div className="badge-row profile-badge-preview">
            {(() => {
              if (!badges.length) {
                return <span className="muted" style={{ fontSize: 12 }}>加载中…</span>;
              }
              const preview = profilePreviewBadges(badges, 4);
              if (!preview.length) {
                return (
                  <span className="muted" style={{ fontSize: 12 }}>
                    读经、探索与小爱互动，解锁第一枚徽章
                  </span>
                );
              }
              return preview.map((b) => (
                <div key={b.id} className="badge-item">
                  <div className={`badge-circle ${b.done ? 'badge-done' : ''}`}>
                    {b.icon}
                  </div>
                  <span>{b.label}</span>
                </div>
              ));
            })()}
          </div>
        </button>
      </div>

      <p className="section-label tab-section-label profile-block-label">常用</p>
      <div className="profile-soft-stack">
        <Link href="/challenge" className="card row-card home-list-row home-list-row-wrap profile-soft-row">
          <span className="pill pill-active">问答</span>
          <span className="home-list-main">
            <strong>今日 5 题</strong>
            <span className="muted home-list-sub">复习错题 · 答题统计</span>
          </span>
          <span className="muted home-list-chevron">›</span>
        </Link>

        <Link href="/notes" className="card row-card home-list-row home-list-row-wrap profile-soft-row">
          <span className="pill">想法</span>
          <span className="home-list-main">
            <strong>我的想法</strong>
            <span className="muted home-list-sub">想法 · 收藏 · 划线</span>
          </span>
          <span className="muted home-list-chevron">›</span>
        </Link>

        <div className="profile-progress-wrap">
          <ReadingProgress />
        </div>
      </div>

      {reviewCards.length > 0 && (
        <div className="card profile-review-card">
          <div className="tab-section-head" style={{ marginTop: 0, marginBottom: 8 }}>
            <p className="section-label tab-section-label">收藏复习</p>
            <Link href="/notes" className="tab-section-link muted">全部 ›</Link>
          </div>
          {reviewCards.map((c) => (
            <Link
              key={c.ref}
              href={`/reader?ref=${encodeURIComponent(c.ref)}`}
              className="muted profile-review-link"
              onClick={() => recordMemoryReview()}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}

      {badgeOpen && (
        <BadgeGallery badges={badges} onClose={() => setBadgeOpen(false)} />
      )}

      {settingsOpen && (
        <div className="sheet-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="sheet card settings-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <h3 style={{ margin: 0 }}>设置</h3>
              <SheetCloseButton onClick={() => setSettingsOpen(false)} />
            </div>

            <div className="settings-card">
              <p className="settings-title">账号</p>
              <AccountSettingsSection onAccountChange={refreshAccount} />
            </div>

            <div className="settings-card">
              <p className="settings-title">工具</p>
              <button
                type="button"
                className="card row-card"
                style={{ display: 'flex', width: '100%', textAlign: 'left' }}
                onClick={() => setDownloadOpen(true)}
              >
                <span style={{ flex: 1 }}>下载</span>
                <span className="muted">离线圣经与资料 ›</span>
              </button>
              <Link
                href="/dictionary"
                className="card row-card"
                style={{ display: 'flex', marginTop: 8 }}
                onClick={openSettingsRoute}
              >
                <span style={{ flex: 1 }}>圣经词典</span>
                <span className="muted">›</span>
              </Link>
              <Link
                href="/profile/reminders"
                className="card row-card"
                style={{ display: 'flex', marginTop: 8 }}
                onClick={openSettingsRoute}
              >
                <span style={{ flex: 1 }}>推送提醒</span>
                <span className="muted">›</span>
              </Link>
              <Link
                href="/profile/appearance"
                className="card row-card"
                style={{ display: 'flex', marginTop: 8 }}
                onClick={openSettingsRoute}
              >
                <span style={{ flex: 1 }}>外观</span>
                <span className="muted">›</span>
              </Link>
              <Link
                href="/profile/licenses"
                className="card row-card"
                style={{ display: 'flex', marginTop: 8 }}
                onClick={openSettingsRoute}
              >
                <span style={{ flex: 1 }}>数据来源与许可</span>
                <span className="muted">›</span>
              </Link>
              {!installedPwa ? (
                <button
                  type="button"
                  className="card row-card"
                  style={{ display: 'flex', marginTop: 8, width: '100%', textAlign: 'left' }}
                  onClick={() => {
                    setSettingsOpen(false);
                    openPwaInstallSheet();
                  }}
                >
                  <span style={{ flex: 1 }}>保存到桌面 App</span>
                  <span className="muted">保存读经记录 ›</span>
                </button>
              ) : null}
            </div>

            {adminEligible ? (
              <div className="settings-card">
                <p className="settings-title">管理</p>
                <Link
                  href="/admin"
                  className="card row-card"
                  style={{ display: 'flex', marginTop: 8 }}
                  onClick={() => {
                    openSettingsRoute();
                  }}
                >
                  <span style={{ flex: 1 }}>管理后台</span>
                  <span className="muted">›</span>
                </Link>
              </div>
            ) : null}

            <div className="settings-card">
              <p className="settings-title">账号</p>
              <Link href="/login" className="card row-card" style={{ display: 'flex', marginTop: 8 }}>
                <span style={{ flex: 1 }}>在其他设备恢复账号</span>
                <span className="muted">›</span>
              </Link>
              <button
                type="button"
                className="clear-cache-btn"
                onClick={handleClearCache}
                disabled={clearCacheBusy}
              >
                {clearCacheBusy ? '清除中…' : '清除缓存'}
              </button>
              {uid ? (
                <button
                  type="button"
                  className="logout-btn settings-logout-btn"
                  onClick={() => {
                    logout();
                    setUid(null);
                    setSettingsOpen(false);
                  }}
                >
                  退出登录
                </button>
              ) : null}
              <p className="muted settings-version-line">
                版本 {appVersion}
              </p>
            </div>
          </div>
        </div>
      )}

      {downloadOpen ? (
        <OfflineDownloadSheet onClose={() => setDownloadOpen(false)} />
      ) : null}

      {pickerOpen && (
        <div
          className="sheet-backdrop sheet-backdrop-above-tab"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="sheet card avatar-picker-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="avatar-picker-title"
          >
            <h3 id="avatar-picker-title" style={{ marginTop: 0 }}>选择头像</h3>
            <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
              {PRESET_AVATARS.length} 款预设 · 圣经主题插画
            </p>
            <div className="avatar-grid">
              {PRESET_AVATARS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`avatar-cell ${a.id === avatarId ? 'avatar-cell-active' : ''}`}
                  title={a.label}
                  aria-pressed={a.id === avatarId}
                  onClick={() => chooseAvatar(a.id)}
                >
                  <span className="avatar-cell-frame">
                    <Avatar id={a.id} size={44} />
                    {a.id === avatarId ? (
                      <span className="avatar-cell-check" aria-hidden>✓</span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
