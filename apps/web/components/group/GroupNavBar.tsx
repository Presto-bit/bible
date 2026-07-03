'use client';

import Link from 'next/link';
import type { GroupDetail } from '@/lib/api';
import { groupMemberCount } from '@/lib/group_ui';

type Props = {
  detail: GroupDetail;
  onOpenSettings: () => void;
};

export function GroupNavBar({ detail, onOpenSettings }: Props) {
  const count = groupMemberCount(detail);

  return (
    <header className="group-wechat-nav">
      <Link href="/discover/groups" className="group-wechat-back" aria-label="返回群列表">
        <span className="group-wechat-back-icon">‹</span>
        <span className="group-wechat-back-label">返回</span>
      </Link>
      <button type="button" className="group-wechat-nav-center" onClick={onOpenSettings}>
        <span className="group-wechat-name">{detail.name}</span>
        <span className="group-wechat-count">（{count}人）</span>
      </button>
      <button
        type="button"
        className="group-wechat-settings icon-btn"
        aria-label="群设置"
        onClick={onOpenSettings}
      >
        ⋯
      </button>
    </header>
  );
}
