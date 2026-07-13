'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { currentUserId, loginWithIdentifier, logout } from '@/lib/api';
import { hasLocalReadingData } from '@/lib/sync_migrate';
import { syncResyncAccount } from '@/lib/sync';
import { notifyLocalDataChanged } from '@/lib/local_data_events';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [uid, setUid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [restoredHint, setRestoredHint] = useState<string | null>(null);
  const [resyncBusy, setResyncBusy] = useState(false);

  useEffect(() => {
    setUid(currentUserId());
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const u = q.get('u') || q.get('id') || '';
    if (u) setIdentifier(u);
  }, []);

  const login = async () => {
    if (!identifier.trim()) return;
    setBusy(true);
    setErr(null);
    setStatus('正在验证账号…');
    setRestoredHint(null);
    try {
      setStatus('正在从账号恢复读经记录…');
      const id = await loginWithIdentifier(identifier.trim(), password);
      setUid(id);
      if (hasLocalReadingData()) {
        setRestoredHint('读经记录已恢复到本机。');
      } else {
        setRestoredHint(
          '登录成功，但账号里暂未找到读经记录。若曾在本机阅读，可能安装前未成功保存到账号；可点下方重试同步。',
        );
      }
      setStatus(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const retrySync = async () => {
    setResyncBusy(true);
    setErr(null);
    try {
      await syncResyncAccount();
      notifyLocalDataChanged('login-resync');
      setRestoredHint(
        hasLocalReadingData()
          ? '读经记录已恢复到本机。'
          : '仍未找到云端读经记录。请确认使用的是设密时的同一账号。',
      );
    } catch {
      setErr('同步失败，请检查网络后重试');
    } finally {
      setResyncBusy(false);
    }
  };

  return (
    <main className="container">
      <h2 style={{ marginBottom: 8 }}>恢复账号</h2>
      <p className="muted" style={{ marginBottom: 20, lineHeight: 1.5 }}>
        桌面 App 重装或清除网站数据后，输入<strong>用户名 + 密码</strong>
        即可从账号找回笔记与读经记录。也支持手机号或用户 ID 登录。
      </p>

      {uid ? (
        <div className="card">
          <p>已恢复到此账号</p>
          <p className="muted" style={{ marginTop: 6, wordBreak: 'break-all' }}>
            用户 ID：{uid}
          </p>
          {restoredHint ? (
            <p style={{ marginTop: 10, lineHeight: 1.5, fontSize: 14 }}>{restoredHint}</p>
          ) : null}
          <Link href="/profile" className="btn" style={{ display: 'inline-block', marginTop: 12, textAlign: 'center' }}>
            返回我的
          </Link>
          <button
            className="btn ghost"
            style={{ marginTop: 10, width: '100%' }}
            type="button"
            disabled={resyncBusy}
            onClick={() => void retrySync()}
          >
            {resyncBusy ? '同步中…' : '重新同步读经记录'}
          </button>
          <button
            className="logout-btn"
            style={{ marginTop: 12 }}
            onClick={() => {
              logout();
              setUid(null);
              setRestoredHint(null);
            }}
          >
            切换其他账号
          </button>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>推荐：用户名 + 密码</p>
          <input
            className="book-chip"
            style={{ width: '100%', textAlign: 'left', marginBottom: 12 }}
            placeholder="用户名 / 手机号 / 用户 ID"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <input
            className="book-chip"
            type="password"
            style={{ width: '100%', textAlign: 'left', marginBottom: 12 }}
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void login();
            }}
          />
          {status && <p className="muted" style={{ marginBottom: 10 }}>{status}</p>}
          {err && <p style={{ color: '#b1554a', marginBottom: 10 }}>{err}</p>}
          <button className="btn" style={{ marginTop: 0 }} onClick={() => void login()} disabled={busy}>
            {busy ? '恢复中…' : '恢复账号'}
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            日常在本机使用无需此步骤。设置账号后，读经记录会保存在账号中，桌面 App 重装后可在此恢复。
          </p>
        </div>
      )}
    </main>
  );
}
