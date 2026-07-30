'use client';

/**
 * 小爱回答后操作：与复制/分享同一行，不单独成块。
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
    <div className={['msg-actions', 'assistant-msg-actions', className].filter(Boolean).join(' ')}>
      {onCopy ? (
        <button type="button" className="msg-action" onClick={onCopy}>
          {copied ? '已复制' : '复制'}
        </button>
      ) : null}
      {onShare ? (
        <button type="button" className="msg-action" onClick={onShare}>
          分享
        </button>
      ) : null}
      <button type="button" className="msg-action" onClick={onSaveThought}>
        {savedThought ? '已存想法' : '存想法'}
      </button>
      {showContinueRead && onContinueRead ? (
        <button type="button" className="msg-action" onClick={onContinueRead}>
          继续读
        </button>
      ) : null}
      {showSources && onOpenSources ? (
        <button type="button" className="msg-action" onClick={onOpenSources}>
          看来源
        </button>
      ) : null}
      {onContinueChat ? (
        <button type="button" className="msg-action msg-action-accent" onClick={onContinueChat}>
          {continueChatLabel}
        </button>
      ) : null}
    </div>
  );
}
