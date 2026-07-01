'use client';

type Props = {
  checkinsThisWeek: number;
  activeDays: number;
  memberCount: number;
  isOwner?: boolean;
  onNudge?: () => void;
  nudgeBusy?: boolean;
  pendingMembers?: number;
};

export function GroupWeeklySummary({
  checkinsThisWeek,
  activeDays,
  memberCount,
  isOwner,
  onNudge,
  nudgeBusy,
  pendingMembers = 0,
}: Props) {
  const showBadge = activeDays >= 5;

  return (
    <div className="group-weekly-summary card card-2">
      <div className="section-row" style={{ marginTop: 0, marginBottom: 6 }}>
        <span className="group-composer-label">本周共读</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showBadge && <span className="group-weekly-badge">本周坚持奖</span>}
          {isOwner && onNudge && pendingMembers > 0 && (
            <button type="button" className="text-link" disabled={nudgeBusy} onClick={onNudge}>
              {nudgeBusy ? '发送中…' : `催打卡 (${pendingMembers})`}
            </button>
          )}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
        本周 <strong>{checkinsThisWeek}</strong> 人次打卡 · <strong>{activeDays}</strong> 天有动态
        {memberCount > 0 ? ` · ${memberCount} 位成员` : ''}
      </p>
    </div>
  );
}
