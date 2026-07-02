'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  bindPhone,
  changePassword,
  effectiveId,
  getUserName,
  hasPassword,
  listDevices,
  setCredentials,
  unbindDevice,
  usernameAvailable,
  type BoundDevice,
} from '@/lib/api';
import { hasSecuredAccount } from '@/lib/account_guide';
import { platformAccountHint } from '@/lib/platform';
import AccountExportCard from '@/components/AccountExportCard';
import SyncStatusBadge from '@/components/SyncStatusBadge';

export default function AccountSecurityCard() {
  const [name, setName] = useState('');
  const [pwd, setPwd] = useState('');
  const [phone, setPhone] = useState('');
  const [phonePwd, setPhonePwd] = useState('');
  const [phoneStored, setPhoneStored] = useState<string | null>(null);
  const [devices, setDevices] = useState<BoundDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [idCopied, setIdCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const id = effectiveId();
  const secured = hasSecuredAccount();

  const load = useCallback(async () => {
    try {
      const d = await listDevices();
      setDevices(d);
    } catch {
      setDevices([]);
    }
    const storedPhone = localStorage.getItem('account_phone');
    if (storedPhone) setPhoneStored(storedPhone);
  }, []);

  useEffect(() => {
    setName(getUserName());
    void load();
  }, [load]);

  const saveUsername = async () => {
    const u = name.trim();
    if (u.length < 2) {
      setMsg('用户名至少 2 个字');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const ok = await usernameAvailable(u);
      if (!ok) {
        setMsg('用户名已被占用');
        return;
      }
      await setCredentials(u, pwd.length >= 6 ? pwd : '');
      setMsg('用户名已保存');
      setPwd('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const bindPhoneHandler = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const p = await bindPhone(phone, phonePwd || null);
      setPhoneStored(p);
      setPhone('');
      setPhonePwd('');
      setMsg('手机号已绑定');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyId = async () => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setIdCopied(true);
      window.setTimeout(() => setIdCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="card account-security-card" style={{ marginBottom: 12 }}>
      <div className="section-row" style={{ marginTop: 0 }}>
        <strong>本机账号</strong>
        <SyncStatusBadge />
      </div>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '6px 0 12px' }}>
        {platformAccountHint()} 打开即可使用，笔记与进度会自动备份到云端。
      </p>

      {!secured ? (
        <div className="account-promo-banner">
          <strong>建议设置用户名</strong>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
            换手机时凭「用户名 + 密码」即可恢复，无需记住数字 ID。
          </p>
          <input
            className="book-chip"
            style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
            placeholder="用户名（≥2 字，不可重复）"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="book-chip"
            type="password"
            style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
            placeholder="密码（≥6 位，建议设置）"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
          <button type="button" className="btn" disabled={busy} onClick={() => void saveUsername()}>
            {busy ? '保存中…' : '保存用户名'}
          </button>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>
          {getUserName() ? `用户名：${getUserName()}` : '已设置账号保护'}
          {hasPassword() ? ' · 已设密码' : ''}
          {phoneStored ? ` · 手机 ${phoneStored}` : ''}
        </p>
      )}

      {msg ? <p style={{ fontSize: 13, marginTop: 8, color: msg.includes('已') ? '#52684f' : '#b1554a' }}>{msg}</p> : null}

      <button
        type="button"
        className="text-link"
        style={{ marginTop: 10, display: 'block' }}
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? '收起高级选项' : '账号安全 · 换机恢复 ›'}
      </button>

      {showAdvanced && (
        <div style={{ marginTop: 12 }}>
          {!phoneStored ? (
            <div style={{ marginBottom: 12 }}>
              <p className="muted" style={{ fontSize: 12 }}>绑定手机号（换机可用手机号+密码登录）</p>
              <input
                className="book-chip"
                style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
                placeholder="大陆手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {hasPassword() ? (
                <input
                  className="book-chip"
                  type="password"
                  style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
                  placeholder="当前密码"
                  value={phonePwd}
                  onChange={(e) => setPhonePwd(e.target.value)}
                />
              ) : null}
              <button type="button" className="font-pill" disabled={busy} onClick={() => void bindPhoneHandler()}>
                绑定手机
              </button>
            </div>
          ) : null}

          <AccountExportCard phone={phoneStored} />

          <div className="settings-card" style={{ marginTop: 12 }}>
            <p className="settings-title">已绑定设备</p>
            {devices.length === 0 ? (
              <p className="muted" style={{ fontSize: 12 }}>暂无记录</p>
            ) : (
              devices.map((d) => (
                <div key={d.id} className="device-row">
                  <span>{d.label}</span>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => void unbindDevice(d.id).then(load)}
                  >
                    解绑
                  </button>
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <p className="muted" style={{ fontSize: 12 }}>用户 ID（一般无需记忆，可复制给客服）</p>
            {id ? (
              <button type="button" className="id-chip" onClick={() => void copyId()}>
                {idCopied ? '已复制 ✓' : `ID ${id}`}
              </button>
            ) : null}
          </div>

          {hasPassword() ? (
            <button
              type="button"
              className="settings-icon-btn"
              style={{ marginTop: 10 }}
              onClick={() => {
                const old = prompt('当前密码：');
                if (old === null) return;
                const next = prompt('新密码（≥6 位）：');
                if (!next || next.length < 6) return;
                void changePassword(old, next).then(() => setMsg('密码已更新'));
              }}
            >
              修改密码
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
