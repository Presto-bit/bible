'use client';

import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import type { GroupDetail } from '@/lib/api';
import { groupMemberCount } from '@/lib/group_ui';
import { ImThreadNav } from '@/components/social/ImThreadNav';

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
    <ImThreadNav
      title={detail.name}
      titleExtra={<span className="group-wechat-count">（{count}人）</span>}
      onTitleClick={onOpenCard}
      items={[
        { id: 'search', label: '搜索聊天记录', onSelect: onOpenSearch },
        { id: 'settings', label: '群设置', onSelect: onOpenSettings },
      ]}
    />
  );
}
