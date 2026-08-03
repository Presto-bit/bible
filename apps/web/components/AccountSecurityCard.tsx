'use client';

import { hasPassword } from '@/lib/api';
import {
  accountRecoveryHint,
  hasBoundPhone,
  isAccountComplete,
} from '@/lib/account_guide';
import { platformAccountHint } from '@/lib/platform';
import { maskPhone, useAccountSecurity } from '@/lib/use_account_security';

type Props = {
  onComplete?: () => void;
  /** password：只催设密；phone：只催绑手机；auto：按状态选一层 */
  focus?: 'auto' | 'password' | 'phone';
};

/**
 * 软催卡片：仅挂「我的」页。
 * - 未设密 → 只设密码（可顺带填手机）
 * - 已设密未绑手机 → 只绑手机
 * 勿再挂全局半屏（PwaFirstOpen 等）拦截其它 Tab。
 */
export default function AccountSecurityCard({ onComplete, focus = 'auto' }: Props) {
  const a = useAccountSecurity(onComplete);

  const resolved =
    focus === 'auto'
      ? !hasPassword()
        ? 'password'
        : !hasBoundPhone()
          ? 'phone'
          : 'done'
      : focus;

  const handleSavePassword = async () => {
    const ok = await a.savePassword();
    if (ok && isAccountComplete()) onComplete?.();
    else if (ok) onComplete?.();
  };

  const handleBindPhone = async () => {
    await a.bindPhoneHandler();
    if (isAccountComplete()) onComplete?.();
  };

  if (resolved === 'done') {
    return (
      <div className="card account-security-card" style={{ marginBottom: 12 }}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>账号已保护</strong>
        </div>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, margin: '6px 0 0' }}>
          已设密码
          {a.phoneStored ? ` · 手机 ${maskPhone(a.phoneStored)}` : ''}
          。换机请用手机号或用户 ID + 密码登录。
        </p>
      </div>
    );
  }

  return (
    <div className="card account-security-card" style={{ marginBottom: 12 }}>
      <div className="section-row" style={{ marginTop: 0 }}>
        <strong>{resolved === 'password' ? '设置密码' : '绑定手机'}</strong>
      </div>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '6px 0 12px' }}>
        {platformAccountHint()}
      </p>

      <div className="account-promo-banner">
        {resolved === 'password' ? (
          <>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
              {accountRecoveryHint() || '设置密码后，换机可找回读经进度。'}
            </p>
            <input
              className="book-chip"
              type="password"
              style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
              placeholder="密码（≥6 位）"
              value={a.pwd}
              onChange={(e) => a.setPwd(e.target.value)}
              autoComplete="new-password"
            />
            <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
              手机号（可选，建议一并绑定）
            </p>
            <input
              className="book-chip"
              style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
              placeholder="大陆手机号"
              value={a.phone}
              onChange={(e) => a.setPhone(e.target.value)}
              inputMode="tel"
            />
            <button
              type="button"
              className="btn"
              disabled={a.busy}
              onClick={() => void handleSavePassword()}
            >
              {a.busy ? '保存中…' : '保存密码'}
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
              绑定后可用手机号 + 密码登录，不必记用户 ID。
            </p>
            <input
              className="book-chip"
              style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
              placeholder="大陆手机号"
              value={a.phone}
              onChange={(e) => a.setPhone(e.target.value)}
              inputMode="tel"
            />
            <button
              type="button"
              className="btn"
              disabled={a.busy || !a.phone.trim()}
              onClick={() => void handleBindPhone()}
            >
              {a.busy ? '绑定中…' : '绑定手机'}
            </button>
          </>
        )}
      </div>

      {a.msg ? (
        <p
          style={{
            fontSize: 13,
            marginTop: 8,
            color: a.msg.includes('已') ? '#52684f' : '#b1554a',
          }}
        >
          {a.msg}
        </p>
      ) : null}
    </div>
  );
}
