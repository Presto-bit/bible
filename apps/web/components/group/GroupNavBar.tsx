'use client';

import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import type { GroupDetail } from '@/lib/api';
import { groupMemberCount } from '@/lib/group_ui';

type Props = {
  detail: GroupDetail;
  onOpenCard: () => void;
  onOpenSettings: () => void;
};

export function GroupNavBar({ detail, onOpenCard, onOpenSettings }: Props) {
  useEdgeSwipeBack({ href: '/discover' });
  const count = groupMemberCount(detail);

  return (
    <header className="group-wechat-nav">
      <PageBackBar href="/discover" label="消息" />
      <button type="button" className="group-wechat-nav-center" onClick={onOpenCard} aria-label="打开群名片">
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
