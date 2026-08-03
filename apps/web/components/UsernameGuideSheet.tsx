'use client';

import { useState } from 'react';
import DismissibleSheetBackdrop from '@/components/ui/DismissibleSheetBackdrop';
import { dismissUsernameGuide } from '@/lib/account_guide';
import { bindPhone, getUserName, setCredentials } from '@/lib/api';

/** 软催设密（可顺带绑手机）；展示称呼请在「我的」Hero 设置 */
export default function UsernameGuideSheet({ onDone }: { onDone: () => void }) {
  const [pwd, setPwd] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      dismissUsernameGuide();
      void import('@/lib/sync').then((m) => m.syncNow().catch(() => {}));
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    dismissUsernameGuide();
    onDone();
  };

  return (
    <DismissibleSheetBackdrop onClose={skip} align="center" style={{ zIndex: 130 }}>
      <div className="sheet card" style={{ borderRadius: 18, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>设置密码，换机可找回</h3>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          用手机号或用户 ID + 密码即可登录。称呼可稍后在「我的」里修改。
        </p>
        <input
          className="book-chip"
          type="password"
          style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
          placeholder="密码（≥6 位）"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          autoComplete="new-password"
        />
        <input
          className="book-chip"
          style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
          placeholder="手机号（可选）"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
        />
        {err ? <p style={{ color: '#b1554a', fontSize: 13 }}>{err}</p> : null}
        <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
          {busy ? '保存中…' : '保存'}
        </button>
        <button type="button" className="text-link" style={{ display: 'block', margin: '12px auto 0' }} onClick={skip}>
          以后再说
        </button>
      </div>
    </DismissibleSheetBackdrop>
  );
}
