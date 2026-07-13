'use client';

import Link from 'next/link';

type Props = {
  onDismiss: () => void;
};

/**
 * 桌面 App 重装后本机为空且未登录：引导用密码恢复读经记录。
 * （卸载并清除网站数据后，仅登录才能从账号拉回。）
 */
export default function RestoreAccountSheet({ onDismiss }: Props) {
  return (
    <div className="sheet-backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="sheet sync-migrate-sheet"
        role="dialog"
        aria-labelledby="restore-account-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="restore-account-title">已有账号？</h2>
        <p className="sync-migrate-desc">
          桌面 App 重装或清除网站数据后，本机读经记录会清空。若你曾设置过用户名与密码，登录后即可从账号恢复。
        </p>
        <div className="sync-migrate-actions">
          <Link href="/login" className="btn primary" onClick={onDismiss}>
            登录恢复
          </Link>
          <button type="button" className="btn ghost" onClick={onDismiss}>
            我是新用户
          </button>
        </div>
      </div>
    </div>
  );
}
