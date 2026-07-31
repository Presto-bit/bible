'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { hasPassword, unbindDevice } from '@/lib/api';
import { isAccountComplete } from '@/lib/account_guide';
import { maskPhone, useAccountSecurity } from '@/lib/use_account_security';

type Props = {
  middle?: ReactNode;
  onAccountChange?: () => void;
  /** 完备时默认收起为摘要行，点开再编辑 */
  collapsible?: boolean;
};

/** 设置 · 账号与安全：密码 / 手机 / 设备 / ID（不含展示称呼） */
export default function AccountSettingsSection({
  middle,
  onAccountChange,
  collapsible = false,
}: Props) {
  const a = useAccountSecurity(onAccountChange);
  const [expanded, setExpanded] = useState(() => !collapsible || !isAccountComplete());

  useEffect(() => {
    if (!collapsible) return;
    if (isAccountComplete()) setExpanded(false);
    else setExpanded(true);
  }, [collapsible, a.phoneStored]);

  const phoneHint = a.phoneStored
    ? `手机 ${maskPhone(a.phoneStored)}`
    : '未绑手机';
  const pwdHint = hasPassword() ? '已设密码' : '未设密码';
  const summary = `${pwdHint} · ${phoneHint}`;

  const form = (
    <div className="settings-account-form">
      {!hasPassword() ? (
        <>
          <p className="settings-field-label">设置密码</p>
          <p className="muted settings-field-hint">换机或重装后，用手机号或用户 ID + 密码找回。</p>
          <div className="settings-field-row">
            <input
              className="book-chip settings-field-input"
              type="password"
              placeholder="密码（≥6 位）"
              value={a.pwd}
              onChange={(e) => a.setPwd(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="font-pill"
              disabled={a.busy}
              onClick={() => void a.savePassword()}
            >
              {a.busy ? '…' : '保存'}
            </button>
          </div>
        </>
      ) : (
        <p className="muted settings-field-hint">已设密码。可在下方修改。</p>
      )}

      {!a.phoneStored ? (
        <>
          <p className="settings-field-label">绑定手机号</p>
          <p className="muted settings-field-hint">
            {hasPassword()
              ? '登录更方便，建议绑定。'
              : '请先设置密码，再绑定手机。'}
          </p>
          <div className="settings-field-row">
            <input
              className="book-chip settings-field-input"
              placeholder="大陆手机号"
              value={a.phone}
              onChange={(e) => a.setPhone(e.target.value)}
              inputMode="tel"
              disabled={!hasPassword()}
            />
            <button
              type="button"
              className="font-pill"
              disabled={a.busy || !a.phone.trim() || !hasPassword()}
              onClick={() => void a.bindPhoneHandler()}
            >
              绑定
            </button>
          </div>
        </>
      ) : (
        <p className="muted settings-field-hint">已绑定手机 {maskPhone(a.phoneStored)}</p>
      )}

      {a.msg ? <p className="muted settings-field-hint">{a.msg}</p> : null}
      {middle}

      {hasPassword() ? (
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
      ) : null}

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
