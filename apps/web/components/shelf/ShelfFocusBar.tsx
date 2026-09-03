'use client';

import { MARK_COLOR_SEMANTICS, MARK_COLORS } from '@/lib/mark_semantics';
import type { HighlightColor } from '@/lib/reader_highlights';

type Props = {
  style: React.CSSProperties;
  markPaletteOpen: boolean;
  currentMark: HighlightColor | null;
  onNote: () => void;
  onToggleMark: () => void;
  onPickColor: (color: HighlightColor) => void;
  onCopy: () => void;
};

function tapAction(e: React.SyntheticEvent, action: () => void) {
  e.preventDefault();
  e.stopPropagation();
  action();
}

export default function ShelfFocusBar({
  style,
  markPaletteOpen,
  currentMark,
  onNote,
  onToggleMark,
  onPickColor,
  onCopy,
}: Props) {
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
      {markPaletteOpen && !currentMark ? (
        <div className="reader-focus-row reader-focus-row-mark" role="group" aria-label="划线颜色">
          {MARK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`reader-weread-dot reader-mark-dot-${c}`}
              title={MARK_COLOR_SEMANTICS[c].label}
              aria-label={MARK_COLOR_SEMANTICS[c].label}
              onPointerUp={(e) => tapAction(e, () => onPickColor(c))}
            />
          ))}
        </div>
      ) : null}
      <div className="reader-focus-row reader-focus-row-actions">
        <button
          type="button"
          className="vsb-icon-btn"
          onPointerUp={(e) => tapAction(e, onNote)}
        >
          <span className="vsb-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z" />
              <path d="M10 19h4M11 22h2" />
            </svg>
          </span>
          <span className="vsb-label">笔记</span>
        </button>
        <button
          type="button"
          className={`vsb-icon-btn${markPaletteOpen || currentMark ? ' vsb-icon-btn-active' : ''}`}
          onPointerUp={(e) => tapAction(e, onToggleMark)}
        >
          <span className="vsb-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 20h7" />
              <path d="M14 19l6-6-4-4-6 6v4h4h4z" />
              <path d="M13 12l3 3" />
            </svg>
          </span>
          <span className="vsb-label">{currentMark ? '取消划线' : '划线'}</span>
        </button>
        <button type="button" className="vsb-icon-btn" onPointerUp={(e) => tapAction(e, onCopy)}>
          <span className="vsb-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
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
