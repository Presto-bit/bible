'use client';

import type { GroupDetail, GroupMessage } from '@/lib/api';
import { groupMemberCount } from '@/lib/group_ui';
import { GroupCheckinWall } from './GroupCheckinWall';

type Props = {
  open: boolean;
  groupId: string;
  detail: GroupDetail;
  messages: GroupMessage[];
  isOwner?: boolean;
  onClose: () => void;
  onReact?: (mid: string, emoji: string) => void;
  onCheckin?: () => void;
};

/** 打卡墙半屏：一屏看谁打了，点开看感想。 */
export function GroupCheckinWallSheet({
  open,
  groupId,
  detail,
  messages,
  isOwner,
  onClose,
  onReact,
  onCheckin,
}: Props) {
  if (!open) return null;
  const total = groupMemberCount(detail);
  const checked = detail.checked_in_today ?? 0;
  const needMine = !detail.my_checked_in_today;

  return (
    <div className="sheet-backdrop group-wall-backdrop" onClick={onClose}>
      <div
        className="sheet card group-wall-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="今日打卡墙"
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row group-wall-sheet-head">
          <div>
            <strong>今日打卡墙</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
              {checked}/{total} 已打卡
            </p>
          </div>
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="group-wall-sheet-body">
          <GroupCheckinWall
            groupId={groupId}
            detail={detail}
            messages={messages}
            isOwner={isOwner}
            onReact={onReact}
          />
        </div>
        {needMine && onCheckin ? (
          <div className="group-wall-sheet-foot">
            <button
              type="button"
              className="btn"
              style={{ width: '100%' }}
              onClick={() => {
                onClose();
                onCheckin();
              }}
            >
              去打卡
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
