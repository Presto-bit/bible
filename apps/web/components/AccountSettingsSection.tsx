'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { hasPassword, unbindDevice } from '@/lib/api';
import { isAccountComplete } from '@/lib/account_guide';
import { isSystemGeneratedUsername } from '@/lib/system_username';
import { maskPhone, useAccountSecurity } from '@/lib/use_account_security';

type Props = {
  middle?: ReactNode;
  onAccountChange?: () => void;
  /** 完备时默认收起为摘要行，点开再编辑 */
  collapsible?: boolean;
};

export default function AccountSettingsSection({
  middle,
  onAccountChange,
  collapsible = false,
}: Props) {
  const a = useAccountSecurity(onAccountChange);
  const [expanded, setExpanded] = useState(() => !collapsible || !isAccountComplete());

  useEffect(() => {
    if (!collapsible) return;
    // 异步拉到手机/密码状态后：完备则收起，未完备保持展开
    if (isAccountComplete() && a.phoneStored) setExpanded(false);
    else if (!isAccountComplete()) setExpanded(true);
  }, [collapsible, a.phoneStored]);

  const phoneHint = a.phoneStored
    ? `手机 ${maskPhone(a.phoneStored)}`
    : '未绑手机';
  const pwdHint = hasPassword() ? '已设密码' : '未设密码';
  const summary = `${phoneHint} · ${pwdHint}`;

  const form = (
    <div className="settings-account-form">
      <p className="settings-field-label">用户名</p>
      <div className="settings-field-row">
        <input
          className="book-chip settings-field-input"
          placeholder="≥2 字，不可重复"
          value={a.name}
          onChange={(e) => a.setName(e.target.value)}
        />
        {isSystemGeneratedUsername(a.name) ? (
          <button
            type="button"
            className="text-link"
            disabled={a.busy}
            onClick={() => void a.reshuffleUsernameHandler()}
          >
            换一个
          </button>
        ) : null}
        <button
          type="button"
          className="font-pill"
          disabled={a.busy}
          onClick={() => void a.saveUsername(false)}
        >
          {a.busy ? '…' : '确认'}
        </button>
      </div>

      {!a.phoneStored ? (
        <>
          <p className="settings-field-label">绑定手机号</p>
          <div className="settings-field-row">
            <input
              className="book-chip settings-field-input"
              placeholder="大陆手机号（可选）"
              value={a.phone}
              onChange={(e) => a.setPhone(e.target.value)}
            />
            <button
              type="button"
              className="font-pill"
              disabled={a.busy || !a.phone.trim()}
              onClick={() => void a.bindPhoneHandler()}
            >
              绑定
            </button>
          </div>
          {hasPassword() ? (
            <input
              className="book-chip settings-field-input settings-field-input-block"
              type="password"
              placeholder="当前密码"
              value={a.phonePwd}
              onChange={(e) => a.setPhonePwd(e.target.value)}
            />
          ) : null}
        </>
      ) : (
        <p className="muted settings-field-hint">已绑定手机 {maskPhone(a.phoneStored)}</p>
      )}

      {a.msg ? <p className="muted settings-field-hint">{a.msg}</p> : null}
      {middle}

      <button
        type="button"
        className="settings-icon-btn"
        onClick={() => void a.changePasswordHandler()}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        修改密码
      </button>

      <button
        type="button"
        className="text-link settings-advanced-toggle"
        onClick={() => a.setShowAdvanced((v) => !v)}
      >
        {a.showAdvanced ? '收起高级选项' : '设备与用户 ID ›'}
      </button>

      {a.showAdvanced ? (
        <div className="settings-advanced">
          <p className="settings-field-label">已绑定设备</p>
          {a.devices.length === 0 ? (
            <p className="muted settings-field-hint">暂无记录</p>
          ) : (
            a.devices.map((d) => (
              <div key={d.id} className="device-row">
                <span>{d.label}</span>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => void unbindDevice(d.id).then(() => void a.load())}
                >
                  解绑
                </button>
              </div>
            ))
          )}
          <p className="settings-field-label">用户 ID（可复制给客服）</p>
          {a.id ? (
            <button type="button" className="id-chip" onClick={() => void a.copyId()}>
              {a.idCopied ? '已复制 ✓' : `ID ${a.id}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (!collapsible) return form;

  return (
    <div className="settings-account-block">
      <button
        type="button"
        className="settings-nav-row"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="settings-nav-glyph" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 19.5c1.8-3 4-4.5 6.5-4.5s4.7 1.5 6.5 4.5" />
          </svg>
        </span>
        <span className="settings-nav-main">
          <strong>账号与安全</strong>
          <span className="muted">{summary}</span>
        </span>
        <span className="muted settings-nav-chevron" aria-hidden>
          {expanded ? '⌃' : '›'}
        </span>
      </button>
      {expanded ? form : null}
    </div>
  );
}
