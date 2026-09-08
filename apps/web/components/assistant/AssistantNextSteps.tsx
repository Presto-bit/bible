'use client';

/**
 * 小爱回答后操作：复制 · 存笔记 · 分享（与半屏轻操作对齐）。
 */
export function AssistantNextSteps({
  showContinueRead,
  onContinueRead,
  onSaveThought,
  savedThought,
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
      <button type="button" className="msg-action" onClick={onSaveThought}>
        {savedThought ? '已存笔记' : '存笔记'}
      </button>
      {onShare ? (
        <button type="button" className="msg-action" onClick={onShare}>
          分享
        </button>
      ) : null}
      {showContinueRead && onContinueRead ? (
        <button type="button" className="msg-action" onClick={onContinueRead}>
          继续读
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
