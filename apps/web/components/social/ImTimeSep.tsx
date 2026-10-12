/** IM 时间/日期分隔条（私聊 · 群聊共用）。 */
'use client';

import { formatChatTimeSep } from '@/lib/im_ui';

type Props = {
  /** 直接文案（群聊按日标签） */
  label?: string | null;
  /** 私聊：由时间戳格式化 */
  createdAt?: string | null;
  className?: string;
};

export function ImTimeSep({
  label,
  createdAt,
  className = 'dm-day-sep',
}: Props) {
  const text = (label || '').trim() || (createdAt ? formatChatTimeSep(createdAt) : '');
  if (!text) return null;
  return (
    <div className={className} role="separator">
      <span>{text}</span>
    </div>
  );
}
