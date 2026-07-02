'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  currentUserId,
  guestId,
  isOnboarded,
  loginWithIdentifier,
  logout,
  setCredentials,
  usernameAvailable,
} from '@/lib/api';
import Avatar, { PRESET_AVATARS, defaultAvatarId } from '@/components/Avatar';
import ReadingProgress from '@/components/ReadingProgress';
import { todayMinutes } from '@/lib/reading';
import { api } from '@/lib/api';
import { readingStreak } from '@/lib/gamification';
import { favoriteReviewCards } from '@/lib/favorite_review';
import { clearAppCacheAndReload } from '@/lib/clear_app_cache';
import { syncNow } from '@/lib/sync';

const AVATAR_KEY = 'profile_avatar';
const NAME_KEY = 'profile_name';
const BIO_KEY = 'profile_bio';
const PWD_KEY = 'account_pwd';

const RANDOM_NAME_CHARS = '云星月晨露松竹明道喜乐平安恩典信望爱光泉石兰桂';

function randomDisplayName(): string {
  const len = 2 + Math.floor(Math.random() * 2);
  let s = '';
  for (let i = 0; i < len; i += 1) {
    s += RANDOM_NAME_CHARS[Math.floor(Math.random() * RANDOM_NAME_CHARS.length)];
  }
  return s;
}

export default function ProfilePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [gid, setGid] = useState<string>('');
  const [mins, setMins] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [loginPwd, setLoginPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [idCopied, setIdCopied] = useState(false);
  const [avatarId, setAvatarId] = useState('a1');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsAvatarOpen, setSettingsAvatarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  // 首次引导：设置名称 + 密码
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [obName, setObName] = useState('');
  const [obPwd, setObPwd] = useState('');
  const [obErr, setObErr] = useState<string | null>(null);
  const [obBusy, setObBusy] = useState(false);
  const [clearCacheBusy, setClearCacheBusy] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [reviewCards, setReviewCards] = useState<{ ref: string; label: string }[]>([]);
  const [streak, setStreak] = useState(0);

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
    setUid(currentUserId());
    setGid(guestId());
    const saved = localStorage.getItem(AVATAR_KEY);
    setAvatarId(saved || defaultAvatarId(currentUserId() || guestId() || undefined));
    setName(localStorage.getItem(NAME_KEY) || '');
    setBio(localStorage.getItem(BIO_KEY) || '');
    setMins(todayMinutes());
    setStreak(readingStreak());
    if (!isOnboarded()) {
      setObName(localStorage.getItem(NAME_KEY) || '');
      setOnboardOpen(true);
    }
  }, []);

  const submitOnboard = async (skip = false) => {
    if (skip) {
      // 跳过也算已引导，但保留默认游客身份
      await setCredentials('', '');
      setOnboardOpen(false);
      return;
    }
    const u = obName.trim();
    if (u.length < 2) {
      setObErr('名称至少 2 个字');
      return;
    }
    if (obPwd.length < 6) {
      setObErr('密码至少 6 位');
      return;
    }
    setObBusy(true);
    setObErr(null);
    try {
      const ok = await usernameAvailable(u);
      if (!ok) {
        setObErr('该用户名已被占用，请换一个');
        return;
      }
      await setCredentials(u, obPwd);
      setName(u);
      setUid(currentUserId());
      setOnboardOpen(false);
    } finally {
      setObBusy(false);
    }
  };

  const saveName = (v: string) => {
    setName(v);
    localStorage.setItem(NAME_KEY, v);
  };
  const saveBio = (v: string) => {
    const t = v.slice(0, 15);
    setBio(t);
    localStorage.setItem(BIO_KEY, t);
  };

  const confirmName = async () => {
    const u = name.trim();
    if (u.length < 2) {
      setNameMsg('用户名至少 2 个字');
      return;
    }
    setNameBusy(true);
    setNameMsg(null);
    try {
      const prev = localStorage.getItem(NAME_KEY) || '';
      if (u !== prev) {
        const ok = await usernameAvailable(u);
        if (!ok) {
          setNameMsg('该用户名已被占用');
          return;
        }
      }
      const pwd = localStorage.getItem(PWD_KEY) || '';
      await setCredentials(u, pwd);
      setNameMsg('已保存');
    } catch (e) {
      setNameMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setNameBusy(false);
    }
  };

  const changePassword = async () => {
    const stored = localStorage.getItem(PWD_KEY);
    if (stored) {
      const old = prompt('请输入当前密码：');
      if (old === null) return;
      if (old !== stored) {
        alert('当前密码不正确');
        return;
      }
    }
    const next = prompt('请输入新密码（≥6 位）：');
    if (next === null) return;
    if (next.length < 6) {
      alert('密码至少 6 位');
      return;
    }
    await setCredentials(name.trim(), next);
    alert('密码已更新');
  };

  const chooseAvatar = (id: string) => {
    setAvatarId(id);
    localStorage.setItem(AVATAR_KEY, id);
    setPickerOpen(false);
    setSettingsAvatarOpen(false);
  };

  const login = async () => {
    if (!identifier.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const id = await loginWithIdentifier(identifier.trim(), loginPwd);
      setUid(id);
      setName(localStorage.getItem(NAME_KEY) || '');
      setLoginPwd('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
          <strong>{displayName}</strong>
          <span className="muted">{bio.trim() || '愿日日亲近主话'}</span>
          {idValue && (
            <button type="button" className="id-chip" onClick={copyId}>
              {idCopied ? '已复制 ✓' : `ID ${idValue}`}
            </button>
          )}
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

      {!uid && (
        <div className="card card-2" style={{ marginBottom: 12 }}>
          <strong>登录 / 切换账号</strong>
          <p className="muted" style={{ margin: '6px 0 12px', lineHeight: 1.5 }}>
            用「用户ID」或「用户名 + 密码」登录，数据按用户ID云端同步。
          </p>
          <input
            className="book-chip"
            style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
            placeholder="用户ID（10 位数字）或 用户名"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <input
            className="book-chip"
            type="password"
            style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
            placeholder="密码（用户ID登录可留空）"
            value={loginPwd}
            onChange={(e) => setLoginPwd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') login();
            }}
          />
          {err && <p style={{ color: '#b1554a', marginBottom: 8 }}>{err}</p>}
          <button className="btn" style={{ marginTop: 0 }} onClick={login} disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </button>
        </div>
      )}

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
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}

      <Link href="/challenge" className="card row-card challenge-card" style={{ display: 'flex', marginTop: 12 }}>
        <span className="pill pill-active">知识挑战</span>
        <span style={{ flex: 1 }}>
          <strong>圣经知识闯关</strong>
          <span className="muted" style={{ display: 'block', fontSize: 12 }}>每日问答 · 答题统计</span>
        </span>
        <span className="muted">去闯关 ›</span>
      </Link>

      <div style={{ marginTop: 12 }}>
        <ReadingProgress />
      </div>

      <Link href="/notes" className="card row-card" style={{ display: 'flex', marginTop: 14 }}>
        <span style={{ flex: 1 }}>我的笔记</span>
        <span className="muted">想法 · 收藏 · 划线 ›</span>
      </Link>

      {settingsOpen && (
        <div className="sheet-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="sheet card settings-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <h3 style={{ margin: 0 }}>设置</h3>
              <button type="button" className="text-link" onClick={() => setSettingsOpen(false)}>关闭</button>
            </div>

            <div className="settings-card">
              <p className="settings-title">个人资料</p>
              <p className="muted" style={{ fontSize: 12 }}>头像</p>
              <div className="settings-avatar-row">
                <Avatar id={avatarId} size={48} />
                <button
                  type="button"
                  className="font-pill"
                  onClick={() => setSettingsAvatarOpen((v) => !v)}
                >
                  {settingsAvatarOpen ? '收起' : '更换头像'}
                </button>
              </div>
              {settingsAvatarOpen && (
                <div className="avatar-grid" style={{ maxHeight: 160, overflowY: 'auto', marginTop: 10 }}>
                  {PRESET_AVATARS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`avatar-cell ${a.id === avatarId ? 'avatar-cell-active' : ''}`}
                      onClick={() => chooseAvatar(a.id)}
                    >
                      <Avatar id={a.id} size={40} />
                    </button>
                  ))}
                </div>
              )}
              <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>用户名</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="settings-input-wrap">
                  <input
                    className="book-chip"
                    style={{ textAlign: 'left' }}
                    placeholder="显示名称"
                    value={name}
                    onChange={(e) => saveName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="settings-random-btn"
                    aria-label="随机生成名称"
                    title="随机生成名称"
                    onClick={() => saveName(randomDisplayName())}
                  >
                    🎲
                  </button>
                </div>
                <button
                  type="button"
                  className="font-pill"
                  disabled={nameBusy}
                  onClick={() => void confirmName()}
                >
                  {nameBusy ? '…' : '确认'}
                </button>
              </div>
              {nameMsg && (
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{nameMsg}</p>
              )}
              <div className="section-row" style={{ marginTop: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>签名</span>
                <span className="muted" style={{ fontSize: 12 }}>{bio.length}/15</span>
              </div>
              <input
                className="book-chip"
                style={{ width: '100%', textAlign: 'left' }}
                placeholder="一句话签名（≤15 字）"
                value={bio}
                maxLength={15}
                onChange={(e) => saveBio(e.target.value)}
              />
              <button
                type="button"
                className="settings-icon-btn"
                style={{ marginTop: 10 }}
                onClick={() => void changePassword()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                修改密码
              </button>
            </div>

            <div className="settings-card">
              <p className="settings-title">工具</p>
              <Link href="/dictionary" className="card row-card" style={{ display: 'flex', marginTop: 8 }}>
                <span style={{ flex: 1 }}>圣经词典</span>
                <span className="muted">›</span>
              </Link>
              <Link href="/profile/reminders" className="card row-card" style={{ display: 'flex', marginTop: 8 }}>
                <span style={{ flex: 1 }}>推送提醒</span>
                <span className="muted">›</span>
              </Link>
            </div>

            <div className="settings-card">
              <p className="settings-title">账号</p>
              <p className="muted" style={{ fontSize: 12 }}>当前 ID：{idValue || '—'}（免注册即用）</p>
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
              <p className="muted settings-version-line">版本 {appVersion}</p>
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

      {onboardOpen && (
        <div className="sheet-backdrop" style={{ alignItems: 'center', zIndex: 130 }}>
          <div className="sheet card" style={{ borderRadius: 18, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>设置你的名称和密码</h3>
            <p className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>
              免注册即用，你的用户ID 是 {gid}。设置用户名（不可重复）与密码后，可在其它设备用「用户名 + 密码」登录。
            </p>
            <input
              className="book-chip"
              style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
              placeholder="用户名（≥2 字，不可重复）"
              value={obName}
              onChange={(e) => setObName(e.target.value)}
            />
            <input
              className="book-chip"
              type="password"
              style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
              placeholder="密码（≥6 位）"
              value={obPwd}
              onChange={(e) => setObPwd(e.target.value)}
            />
            {obErr && <p style={{ color: '#b1554a', marginBottom: 8, fontSize: 13 }}>{obErr}</p>}
            <button className="btn" style={{ marginTop: 0 }} onClick={() => submitOnboard(false)} disabled={obBusy}>
              {obBusy ? '保存中…' : '保存并继续'}
            </button>
            <button
              type="button"
              className="text-link"
              style={{ display: 'block', margin: '12px auto 0' }}
              onClick={() => submitOnboard(true)}
            >
              暂时跳过
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
