'use client';

import { useState } from 'react';
import { dismissUsernameGuide } from '@/lib/account_guide';
import { setCredentials, usernameAvailable } from '@/lib/api';

export default function UsernameGuideSheet({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      dismissUsernameGuide();
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
    <div className="sheet-backdrop" style={{ alignItems: 'center', zIndex: 130 }}>
      <div className="sheet card" style={{ borderRadius: 18, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>给账号起个名字吧</h3>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          你已有笔记或群数据。设置用户名和密码后，换手机也能找回，无需记住数字 ID。
        </p>
        <input
          className="book-chip"
          style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
          placeholder="用户名（≥2 字）"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="book-chip"
          type="password"
          style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
          placeholder="密码（≥6 位）"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        />
        {err ? <p style={{ color: '#b1554a', fontSize: 13 }}>{err}</p> : null}
        <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
          {busy ? '保存中…' : '保存'}
        </button>
        <button type="button" className="text-link" style={{ display: 'block', margin: '12px auto 0' }} onClick={skip}>
          以后再说
        </button>
      </div>
    </div>
  );
}
