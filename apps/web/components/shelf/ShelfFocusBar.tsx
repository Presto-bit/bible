'use client';

import { shellTapProps } from '@/lib/shell_tap';

type Props = {
  style: React.CSSProperties;
  onNote: () => void;
  onCopy: () => void;
};

export default function ShelfFocusBar({ style, onNote, onCopy }: Props) {
  return (
    <div
      className="reader-focus-bar reader-focus-bar-ext reader-focus-bar-near shelf-focus-bar"
      style={style}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div className="reader-focus-row reader-focus-row-actions">
        <button
          type="button"
          className="vsb-icon-btn"
          {...shellTapProps({ onTap: onNote, preventDefault: true })}
        >
          <span className="vsb-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z" />
              <path d="M10 19h4M11 22h2" />
            </svg>
          </span>
          <span className="vsb-label">笔记</span>
        </button>
        <button
          type="button"
          className="vsb-icon-btn"
          {...shellTapProps({ onTap: onCopy, preventDefault: true })}
        >
          <span className="vsb-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </span>
          <span className="vsb-label">复制</span>
        </button>
      </div>
    </div>
  );
}
