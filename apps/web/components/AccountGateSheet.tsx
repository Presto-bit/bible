'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  acceptGuestRisk,
  markAccountGateSeen,
} from '@/lib/account_guide';
import { setCredentials, usernameAvailable } from '@/lib/api';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import { useToast } from '@/components/ui/ToastProvider';

type Mode = 'choose' | 'form' | 'guest-confirm';

type Props = {
  onDone: () => void;
};

export default function AccountGateSheet({ onDone }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('choose');
  const [name, setName] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    onDone();
  };

  const save = async () => {
    const u = name.trim();
    if (u.length < 2) {
      setErr('用户名至少 2 个字');
      return;
    }
    if (pwd.length < 6) {
      setErr('密码至少 6 位');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const ok = await usernameAvailable(u);
      if (!ok) {
        setErr('用户名已被占用');
        return;
      }
      await setCredentials(u, pwd);
      markAccountGateSeen();
      toast('账号已保护，换机可凭用户名找回');
      finish();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmGuest = () => {
    acceptGuestRisk();
    finish();
  };

  return (
    <div className="sheet-backdrop" style={{ alignItems: 'center', zIndex: 145 }}>
      <div
        className="sheet card account-gate-sheet"
        style={{ borderRadius: 18, maxWidth: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        {mode === 'choose' || mode === 'form' ? (
          <>
            <h3 style={{ marginTop: 0 }}>保护你的读经进度</h3>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
              删掉 App、换手机或清除网站数据后，没有账号的进度可能找不回来。
              建议先设置用户名和密码。
            </p>

            {mode === 'form' ? (
              <div className="account-gate-form">
                <input
                  className="book-chip"
                  style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
                  placeholder="用户名（≥2 字）"
                  autoComplete="username"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="book-chip"
                  type="password"
                  style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
                  placeholder="密码（≥6 位）"
                  autoComplete="new-password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                />
                {err ? <p style={{ color: '#b1554a', fontSize: 13 }}>{err}</p> : null}
                <button type="button" className="btn" style={{ width: '100%', marginTop: 0 }} disabled={busy} onClick={() => void save()}>
                  {busy ? '保存中…' : '保存并保护'}
                </button>
                <button
                  type="button"
                  className="text-link"
                  style={{ display: 'block', margin: '12px auto 0' }}
                  onClick={() => {
                    setErr(null);
                    setMode('choose');
                  }}
                >
                  返回
                </button>
              </div>
            ) : (
              <div className="account-gate-actions">
                <button type="button" className="btn" style={{ width: '100%', marginTop: 0 }} onClick={() => setMode('form')}>
                  设置用户名和密码
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ width: '100%', marginTop: 10 }}
                  onClick={() => setMode('guest-confirm')}
                >
                  先以游客继续
                </button>
                <p className="muted" style={{ fontSize: 11, lineHeight: 1.45, margin: '8px 0 0', textAlign: 'center' }}>
                  游客数据仅存本机，重装或换机可能丢失
                </p>
                <Link
                  href="/login"
                  className="text-link"
                  style={{ display: 'block', margin: '14px auto 0', textAlign: 'center' }}
                  onClick={() => {
                    markRouteNavigation();
                    // 仅关闭本层，不记「已走过门闸」，未登录回来冷启动仍会提示
                    finish();
                  }}
                >
                  已有账号？去登录
                </Link>
              </div>
            )}
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>确定先不设账号？</h3>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
              本机读经、笔记与成就在重装、换机或清除网站数据后可能被清空，且无法用账号找回。
            </p>
            <button type="button" className="btn" style={{ width: '100%', marginTop: 0 }} onClick={() => setMode('form')}>
              回去设账号
            </button>
            <button
              type="button"
              className="text-link"
              style={{ display: 'block', margin: '14px auto 0' }}
              onClick={confirmGuest}
            >
              仍用游客继续
            </button>
          </>
        )}
      </div>
    </div>
  );
}
