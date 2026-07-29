'use client';

type Props = {
  count: number;
  previewTitle?: string | null;
  onOpen: () => void;
  onDismiss: () => void;
};

/** 会话顶轻入口：仅有待认领代祷时出现 */
export function GroupPrayerBanner({ count, previewTitle, onOpen, onDismiss }: Props) {
  if (count <= 0) return null;
  const title =
    count === 1
      ? (previewTitle ? `代祷：${previewTitle}` : '有 1 条代祷待认领')
      : `有 ${count} 条代祷待认领`;
  const desc = count === 1 ? '点开认领，与弟兄姊妹同心事奉' : '点开查看并认领';

  return (
    <div className="group-prayer-banner" role="status">
      <button type="button" className="group-prayer-banner-main" onClick={onOpen}>
        <span className="group-prayer-banner-kicker">代祷</span>
        <span className="group-prayer-banner-title">{title}</span>
        <span className="muted group-prayer-banner-desc">{desc}</span>
      </button>
      <button
        type="button"
        className="group-prayer-banner-x"
        aria-label="暂时收起"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
