'use client';

import { useState } from 'react';
import { buildAccountRecoveryText, recoveryLoginUrl } from '@/lib/account_export';
import { effectiveId, getUserName } from '@/lib/api';

export default function AccountExportCard({ phone }: { phone?: string | null }) {
  const [copied, setCopied] = useState(false);
  const id = effectiveId();
  const name = getUserName().trim();
  const recoveryUrl = recoveryLoginUrl();
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(recoveryUrl)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildAccountRecoveryText(phone));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="settings-card account-export-card">
      <p className="settings-title">账号备份卡</p>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        截图保存或复制下方信息，换机时可快速恢复账号。
      </p>
      <div className="account-export-body">
        <img src={qrSrc} alt="恢复账号二维码" width={140} height={140} className="account-export-qr" />
        <div className="account-export-meta">
          {name ? <p><strong>{name}</strong></p> : null}
          {phone ? <p className="muted" style={{ fontSize: 12 }}>手机 {phone}</p> : null}
          {id ? <p className="muted" style={{ fontSize: 12 }}>ID {id}</p> : null}
        </div>
      </div>
      <button type="button" className="font-pill" onClick={() => void copy()}>
        {copied ? '已复制 ✓' : '复制账号信息'}
      </button>
    </div>
  );
}
