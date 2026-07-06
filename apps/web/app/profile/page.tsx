'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
import { OfflineBibleCard } from '@/components/OfflineBibleCard';
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
import { syncNow } from '@/lib/sync';
import { pushProfileAvatar } from '@/lib/profile_sync';
import { isAccountComplete } from '@/lib/account_guide';
import { fetchAdminEligible } from '@/lib/admin_rag';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { isStandalonePwa } from '@/lib/platform';

const AVATAR_KEY = 'profile_avatar';
const NAME_KEY = 'profile_name';
const BIO_KEY = 'profile_bio';

export default function ProfilePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [gid, setGid] = useState<string>('');
  const [mins, setMins] = useState(0);
  const [idCopied, setIdCopied] = useState(false);
  const [avatarId, setAvatarId] = useState('a1');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    const ok = window.confirm(
      '将清除页面与离线缓存并刷新应用，不会删除你的读经记录、笔记与账号登录状态。',
    );
    if (!ok) return;
    setClearCacheBusy(true);
    try {
      await clearAppCacheAndReload();
    } catch {
      setClearCacheBusy(false);
      alert('清除失败，请尝试在浏览器设置中清除站点数据后重开');
    }
  };

  const displayName = name.trim() || '读经伙伴';
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

  return (
    <main className="container">
      <header className="profile-head">
        <button
          type="button"
          className="profile-avatar-btn"
          onClick={() => setPickerOpen(true)}
          aria-label="更换头像"
        >
          <Avatar id={avatarId} size={56} />
        </button>
        <div className="profile-meta">
          <div className="section-row" style={{ marginTop: 0, gap: 8 }}>
            <strong>{displayName}</strong>
            <SyncStatusBadge />
          </div>
          {bioEditing ? (
            <div style={{ marginTop: 4 }}>
              <input
                className="book-chip"
                style={{ width: '100%', textAlign: 'left', fontSize: 12 }}
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
              <span className="muted" style={{ fontSize: 12 }}>
                {bio.trim() ? bio : '点击添加签名'}
              </span>
              <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>编辑</span>
            </button>
          )}
          {idValue && !accountComplete && (
            <button type="button" className="id-chip" onClick={copyId}>
              {idCopied ? '已复制 ✓' : `ID ${idValue}`}
            </button>
          )}
          <span className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
            {hasPwd ? '已设密码 · 换机可恢复' : '建议设置用户名，换机更方便'}
          </span>
        </div>
        <button
          type="button"
          className="icon-btn"
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

      {streak > 0 && (
        <div className="streak-banner" style={{ marginTop: 12 }}>
          <span className="streak-flame">🔥</span>
          <span>连续读经 <strong>{streak}</strong> 天</span>
        </div>
      )}

      <Link href="/report" className="card row-card profile-reading-card" style={{ display: 'flex', marginTop: streak > 0 ? 12 : 0 }}>
        <span className="profile-reading-label">阅读时长</span>
        <span className="muted profile-reading-meta">
          今日 {mins} 分钟 · 读经回顾 ›
        </span>
      </Link>

      <div
        className="card"
        style={{ marginTop: 12, cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onClick={() => setBadgeOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setBadgeOpen(true);
        }}
      >
        <div className="section-row">
          <span style={{ fontWeight: 600 }}>成就徽章</span>
          <span className="muted">
            {badges.length
              ? `已收集 ${badges.filter((b) => b.done).length}/${badges.length} ›`
              : '查看全部 ›'}
          </span>
        </div>
        <div className="badge-row">
          {(() => {
            const preview = badges.length
              ? profilePreviewBadges(badges, 4)
              : [];
            if (!badges.length) {
              return <span className="muted" style={{ fontSize: 12 }}>加载中…</span>;
            }
            if (!preview.length) {
              return <span className="muted" style={{ fontSize: 12 }}>读经、探索与小爱互动，解锁第一枚徽章</span>;
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
      </div>

      {badgeOpen && (
        <BadgeGallery badges={badges} onClose={() => setBadgeOpen(false)} />
      )}

      {reviewCards.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="section-row">
            <span style={{ fontWeight: 600 }}>收藏复习</span>
            <Link href="/notes" className="muted">全部 ›</Link>
          </div>
          {reviewCards.map((c) => (
            <Link
              key={c.ref}
              href={`/reader?ref=${encodeURIComponent(c.ref)}`}
              className="muted"
              style={{ display: 'block', marginTop: 8, fontSize: 13 }}
              onClick={() => recordMemoryReview()}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}

      <Link href="/challenge" className="card row-card challenge-card" style={{ display: 'flex', marginTop: 12 }}>
        <span className="pill pill-active">每日问答</span>
        <span style={{ flex: 1 }}>
          <strong>今日 5 题</strong>
          <span className="muted" style={{ display: 'block', fontSize: 12 }}>复习错题 · 答题统计</span>
        </span>
        <span className="muted">开始 ›</span>
      </Link>

      <div style={{ marginTop: 12 }}>
        <ReadingProgress />
      </div>

      <Link href="/notes" className="card row-card" style={{ display: 'flex', marginTop: 14 }}>
        <span style={{ flex: 1 }}>经文记忆</span>
        <span className="muted">想法 · 收藏 · 划线 ›</span>
      </Link>

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
              <OfflineBibleCard />
              <Link href="/dictionary" className="card row-card" style={{ display: 'flex', marginTop: 8 }}>
                <span style={{ flex: 1 }}>圣经词典</span>
                <span className="muted">›</span>
              </Link>
              <Link href="/profile/reminders" className="card row-card" style={{ display: 'flex', marginTop: 8 }}>
                <span style={{ flex: 1 }}>推送提醒</span>
                <span className="muted">›</span>
              </Link>
              <Link href="/profile/appearance" className="card row-card" style={{ display: 'flex', marginTop: 8 }}>
                <span style={{ flex: 1 }}>外观</span>
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
                  <span style={{ flex: 1 }}>添加到主屏幕</span>
                  <span className="muted">像 App 一样打开 ›</span>
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
                  onClick={() => setSettingsOpen(false)}
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

      {pickerOpen && (
        <div className="sheet-backdrop" onClick={() => setPickerOpen(false)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>选择头像</h3>
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
                  onClick={() => chooseAvatar(a.id)}
                >
                  <Avatar id={a.id} size={44} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
