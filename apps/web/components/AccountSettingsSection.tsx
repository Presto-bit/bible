'use client';

import { hasPassword, unbindDevice } from '@/lib/api';
import { maskPhone, useAccountSecurity } from '@/lib/use_account_security';

type Props = {
  middle?: React.ReactNode;
  onAccountChange?: () => void;
};

export default function AccountSettingsSection({ middle, onAccountChange }: Props) {
  const a = useAccountSecurity(onAccountChange);

  const phoneBlock = !a.phoneStored ? (
    <>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>绑定手机号</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input
          className="book-chip"
          style={{ flex: 1, textAlign: 'left' }}
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
          className="book-chip"
          type="password"
          style={{ width: '100%', textAlign: 'left', marginTop: 8 }}
          placeholder="当前密码"
          value={a.phonePwd}
          onChange={(e) => a.setPhonePwd(e.target.value)}
        />
      ) : null}
    </>
  ) : (
    <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
      已绑定手机 {maskPhone(a.phoneStored)}
    </p>
  );

  return (
    <>
      <p className="muted" style={{ fontSize: 12 }}>用户名</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="book-chip"
          style={{ flex: 1, textAlign: 'left' }}
          placeholder="≥2 字，不可重复"
          value={a.name}
          onChange={(e) => a.setName(e.target.value)}
        />
        <button
          type="button"
          className="font-pill"
          disabled={a.busy}
          onClick={() => void a.saveUsername(false)}
        >
          {a.busy ? '…' : '确认'}
        </button>
      </div>
      {phoneBlock}
      {a.msg ? (
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{a.msg}</p>
      ) : null}
      {middle}
      <button
        type="button"
        className="settings-icon-btn"
        style={{ marginTop: 10 }}
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
        className="text-link"
        style={{ marginTop: 10, display: 'block' }}
        onClick={() => a.setShowAdvanced((v) => !v)}
      >
        {a.showAdvanced ? '收起高级选项' : '设备与用户 ID ›'}
      </button>
      {a.showAdvanced ? (
        <div style={{ marginTop: 10 }}>
          <p className="muted" style={{ fontSize: 12 }}>已绑定设备</p>
          {a.devices.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>暂无记录</p>
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
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>用户 ID（可复制给客服）</p>
          {a.id ? (
            <button type="button" className="id-chip" onClick={() => void a.copyId()}>
              {a.idCopied ? '已复制 ✓' : `ID ${a.id}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
