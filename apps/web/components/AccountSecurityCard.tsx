'use client';

import { isAccountComplete } from '@/lib/account_guide';
import { platformAccountHint } from '@/lib/platform';
import { useAccountSecurity } from '@/lib/use_account_security';
import SyncStatusBadge from '@/components/SyncStatusBadge';

type Props = {
  onComplete?: () => void;
};

export default function AccountSecurityCard({ onComplete }: Props) {
  const a = useAccountSecurity(onComplete);

  const handleSave = async () => {
    const ok = await a.saveUsername(true);
    if (ok && isAccountComplete()) onComplete?.();
  };

  return (
    <div className="card account-security-card" style={{ marginBottom: 12 }}>
      <div className="section-row" style={{ marginTop: 0 }}>
        <strong>本机账号</strong>
        <SyncStatusBadge />
      </div>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '6px 0 12px' }}>
        {platformAccountHint()}
      </p>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, margin: '0 0 12px' }}>
        重装或换机：用手机号/用户名登录 → 等待同步完成。未登录时数据仅保存在本机。
      </p>

      <div className="account-promo-banner">
        <strong>建议设置用户名与密码</strong>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
          删掉主屏幕重装后，凭「用户名/手机号 + 密码」登录即可拉回读经进度与成就。
        </p>
        <input
          className="book-chip"
          style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
          placeholder="用户名（≥2 字，不可重复）"
          value={a.name}
          onChange={(e) => a.setName(e.target.value)}
        />
        {!a.phoneStored ? (
          <>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
              绑定手机号（可选，换机可用手机号+密码登录）
            </p>
            <input
              className="book-chip"
              style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
              placeholder="大陆手机号"
              value={a.phone}
              onChange={(e) => a.setPhone(e.target.value)}
            />
          </>
        ) : null}
        <input
          className="book-chip"
          type="password"
          style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
          placeholder="密码（≥6 位）"
          value={a.pwd}
          onChange={(e) => a.setPwd(e.target.value)}
        />
        <button type="button" className="btn" disabled={a.busy} onClick={() => void handleSave()}>
          {a.busy ? '保存中…' : '保存'}
        </button>
      </div>

      {a.msg ? (
        <p style={{ fontSize: 13, marginTop: 8, color: a.msg.includes('已') ? '#52684f' : '#b1554a' }}>{a.msg}</p>
      ) : null}
    </div>
  );
}
