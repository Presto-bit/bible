'use client';

import { IconSendFailed } from '@/components/social/ImComposerIcons';

type Props = {
  onClick?: () => void;
  /** 无可点侧重发时仅作提示 */
  disabled?: boolean;
  label?: string;
};

/** 气泡旁发送失败图标（审核拦截 / 网络失败等） */
export function ImSendFailBadge({
  onClick,
  disabled,
  label = '发送失败，点击重发',
}: Props) {
  return (
    <button
      type="button"
      className="im-send-fail-btn"
      aria-label={label}
      disabled={disabled || !onClick}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <IconSendFailed />
    </button>
  );
}
