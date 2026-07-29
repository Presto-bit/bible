'use client';

import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import type { GroupDetail } from '@/lib/api';
import { groupMemberCount } from '@/lib/group_ui';

type Props = {
  detail: GroupDetail;
  onOpenCard: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
};

export function GroupNavBar({ detail, onOpenCard, onOpenSearch, onOpenSettings }: Props) {
  useEdgeSwipeBack({ href: '/discover' });
  const count = groupMemberCount(detail);

  return (
    <header className="group-wechat-nav">
      <PageBackBar href="/discover" label="消息" />
      <button type="button" className="group-wechat-nav-center" onClick={onOpenCard} aria-label="打开群名片">
        <span className="group-wechat-name">{detail.name}</span>
        <span className="group-wechat-count">（{count}人）</span>
      </button>
      <div className="group-wechat-nav-actions">
        <button
          type="button"
          className="group-wechat-settings icon-btn"
          aria-label="搜索聊天记录"
          onClick={onOpenSearch}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="group-wechat-settings icon-btn"
          aria-label="群设置"
          onClick={onOpenSettings}
        >
          ⋯
        </button>
      </div>
    </header>
  );
}
