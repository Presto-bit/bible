/** IM 会话「回到底部」按钮（私聊 / 群聊共用）。 */
'use client';

type Props = {
  selectMode?: boolean;
  jumpUnread: number;
  onClick: () => void;
};

export function ImJumpBottomButton({ selectMode = false, jumpUnread, onClick }: Props) {
  return (
    <button
      type="button"
      className={`im-jump-bottom${selectMode ? ' is-selecting' : ''}${jumpUnread > 0 ? ' has-unread' : ''}`}
      onClick={onClick}
    >
      回到底部
      {jumpUnread > 0 ? (
        <span className="im-jump-badge">{jumpUnread > 99 ? '99+' : jumpUnread}</span>
      ) : null}
    </button>
  );
}
