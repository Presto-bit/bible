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
        <span className="group-wechat-input-placeholder">写打卡感想、分享读经…</span>
      </button>
    </footer>
  );
}
