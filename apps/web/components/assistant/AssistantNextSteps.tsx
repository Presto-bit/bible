'use client';

/**
 * 小爱回答后的「接下来」：主路径动作（继续读 / 存想法 / 看来源）+ 次级工具行。
 */
export function AssistantNextSteps({
  showContinueRead,
  onContinueRead,
  onSaveThought,
  savedThought,
  showSources,
  onOpenSources,
  onCopy,
  copied,
  onShare,
  onContinueChat,
  continueChatLabel = '继续聊',
  className,
}: {
  showContinueRead?: boolean;
  onContinueRead?: () => void;
  onSaveThought: () => void;
  savedThought?: boolean;
  showSources?: boolean;
  onOpenSources?: () => void;
  onCopy?: () => void;
  copied?: boolean;
  onShare?: () => void;
  onContinueChat?: () => void;
  continueChatLabel?: string;
  className?: string;
}) {
  return (
    <div className={['assistant-next-steps', className].filter(Boolean).join(' ')}>
      <p className="assistant-next-steps-label">接下来</p>
      <div className="assistant-next-steps-primary">
        {showContinueRead && onContinueRead ? (
          <button type="button" className="assistant-next-btn" onClick={onContinueRead}>
            继续读
          </button>
        ) : null}
        <button type="button" className="assistant-next-btn" onClick={onSaveThought}>
          {savedThought ? '已存想法' : '存想法'}
        </button>
        {showSources && onOpenSources ? (
          <button type="button" className="assistant-next-btn" onClick={onOpenSources}>
            看来源
          </button>
        ) : null}
      </div>
      {(onCopy || onShare || onContinueChat) && (
        <div className="assistant-next-steps-secondary">
          {onCopy ? (
            <button type="button" className="assistant-next-link" onClick={onCopy}>
              {copied ? '已复制' : '复制'}
            </button>
          ) : null}
          {onShare ? (
            <button type="button" className="assistant-next-link" onClick={onShare}>
              分享
            </button>
          ) : null}
          {onContinueChat ? (
            <button
              type="button"
              className="assistant-next-link assistant-next-link-accent"
              onClick={onContinueChat}
            >
              {continueChatLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
