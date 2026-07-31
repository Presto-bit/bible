'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  acceptGuestRisk,
  markAccountGateSeen,
} from '@/lib/account_guide';
import { bindPhone, getUserName, setCredentials } from '@/lib/api';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import { useToast } from '@/components/ui/ToastProvider';

type Mode = 'choose' | 'form' | 'guest-confirm';

type Props = {
  onDone: () => void;
};

/** 首启门闸：只催设密（可顺带绑手机）；称呼请在「我的」设置 */
export default function AccountGateSheet({ onDone }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('choose');
  const [pwd, setPwd] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    onDone();
  };

  const save = async () => {
    if (pwd.length < 6) {
      setErr('密码至少 6 位');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await setCredentials(getUserName().trim(), pwd);
      const p = phone.trim();
      if (p) await bindPhone(p, null);
      markAccountGateSeen();
      toast(p ? '账号已保护，可用手机号找回' : '密码已设置，已开启云同步');
      void import('@/lib/sync').then((m) => m.syncNow().catch(() => {}));
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
              删掉 App、换手机或清除网站数据后，没有密码的进度可能找不回来。
              建议先设置密码；绑定手机后登录更方便。
            </p>

            {mode === 'form' ? (
              <div className="account-gate-form">
                <input
                  className="book-chip"
                  type="password"
                  style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
                  placeholder="密码（≥6 位）"
                  autoComplete="new-password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                />
                <input
                  className="book-chip"
                  style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
                  placeholder="手机号（可选）"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
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
                  设置密码
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
            <h3 style={{ marginTop: 0 }}>确定先不设密码？</h3>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
              本机读经、笔记与成就在重装、换机或清除网站数据后可能被清空，且无法用账号找回。
            </p>
            <button type="button" className="btn" style={{ width: '100%', marginTop: 0 }} onClick={() => setMode('form')}>
              回去设密码
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
