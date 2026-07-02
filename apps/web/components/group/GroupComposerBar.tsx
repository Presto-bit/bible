'use client';

type Props = {
  disabled?: boolean;
  onOpen: () => void;
};

export function GroupComposerBar({ disabled, onOpen }: Props) {
  return (
    <footer className="group-wechat-composer">
      <button
        type="button"
        className="group-wechat-input"
        disabled={disabled}
        onClick={onOpen}
        aria-label="写打卡"
      >
        <span className="group-wechat-input-placeholder">打卡 · 分享今日读经感受</span>
      </button>
    </footer>
  );
}
