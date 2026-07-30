'use client';

type Props = {
  bookName: string;
  chapter: number;
  compact?: boolean;
  englishUI?: boolean;
  onOpen: () => void;
  onSkipSession: () => void;
  onDisableForever: () => void;
};

/** 章首轻提示：不挡正文，引导打开章导读半屏。 */
export function ChapterGuideTip({
  bookName,
  chapter,
  compact = false,
  englishUI = false,
  onOpen,
  onSkipSession,
  onDisableForever,
}: Props) {
  if (englishUI) {
    return (
      <div
        className={`chapter-guide-tip${compact ? ' is-compact' : ''}`}
        role="status"
      >
        <div className="chapter-guide-tip-main">
          <span className="chapter-guide-tip-icon" aria-hidden>
            ✦
          </span>
          <span className="chapter-guide-tip-text">
            {compact
              ? `Ch. ${chapter} guide`
              : `30-sec guide for ${bookName} ${chapter}`}
          </span>
        </div>
        <div className="chapter-guide-tip-actions">
          <button type="button" className="chapter-guide-tip-open" onClick={onOpen}>
            Open
          </button>
          <button type="button" className="chapter-guide-tip-skip" onClick={onSkipSession}>
            Dismiss
          </button>
          {!compact ? (
            <button
              type="button"
              className="chapter-guide-tip-mute"
              onClick={onDisableForever}
            >
              Don&apos;t tip
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`chapter-guide-tip${compact ? ' is-compact' : ''}`}
      role="status"
    >
      <div className="chapter-guide-tip-main">
        <span className="chapter-guide-tip-icon" aria-hidden>
          ✦
        </span>
        <span className="chapter-guide-tip-text">
          {compact
            ? `第 ${chapter} 章导读`
            : `30 秒章导读 · ${bookName} 第 ${chapter} 章`}
        </span>
      </div>
      <div className="chapter-guide-tip-actions">
        <button type="button" className="chapter-guide-tip-open" onClick={onOpen}>
          打开
        </button>
        <button type="button" className="chapter-guide-tip-skip" onClick={onSkipSession}>
          本次忽略
        </button>
        {!compact ? (
          <button
            type="button"
            className="chapter-guide-tip-mute"
            onClick={onDisableForever}
          >
            不再提示
          </button>
        ) : null}
      </div>
    </div>
  );
}
