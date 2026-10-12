/** IM 回复引用块（私聊 / 群聊共用样式）。 */
'use client';

type Props = {
  title: string;
  snippet: string;
  onActivate?: () => void;
  disabled?: boolean;
  /** 默认 button；群聊可用 span */
  as?: 'button' | 'span';
};

export function ImReplyQuote({
  title,
  snippet,
  onActivate,
  disabled = false,
  as = 'button',
}: Props) {
  const className = `group-msg-reply-quote${onActivate ? ' is-tappable' : ''}`;
  if (as === 'span') {
    return (
      <span
        className={className}
        role={onActivate ? 'button' : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onActivate?.();
        }}
      >
        <span className="muted">{title}</span>
        <p>{snippet}</p>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onActivate?.();
      }}
    >
      <span className="muted">{title}</span>
      <p>{snippet}</p>
    </button>
  );
}
