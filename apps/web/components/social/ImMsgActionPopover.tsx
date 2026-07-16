'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';

export type ImPopoverAction = {
  id: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
};

type Props = {
  open: boolean;
  anchorEl: HTMLElement | null;
  /** 己方消息靠右，对方靠左 */
  align?: 'start' | 'end';
  actions: ImPopoverAction[];
  onClose: () => void;
  /** 气泡旁一行快捷表情（可选） */
  quickEmojis?: string[];
  /** 短语回应（如「为你加油」） */
  phraseKeys?: Array<{ key: string; label: string }>;
  onEmoji?: (emoji: string) => void;
};

const PAD = 10;
const BAR_H = 52;

/**
 * 飞书式消息操作条：锚定气泡附近，上方不够则翻到下方。
 * 经 AppBodyPortal 挂到 body，避免被 chat 页 overflow:hidden 裁切。
 */
export function ImMsgActionPopover({
  open,
  anchorEl,
  align = 'start',
  actions,
  onClose,
  quickEmojis,
  phraseKeys,
  onEmoji,
}: Props) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; place: 'above' | 'below' } | null>(
    null,
  );
  const [moreEmoji, setMoreEmoji] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const bar = barRef.current;
      const bw = bar?.offsetWidth || Math.min(320, window.innerWidth - PAD * 2);
      const bh = bar?.offsetHeight || BAR_H;
      if (!anchorEl) {
        setPos({
          top: Math.max(PAD, (window.innerHeight - bh) / 2),
          left: Math.max(PAD, (window.innerWidth - bw) / 2),
          place: 'above',
        });
        return;
      }
      const rect = anchorEl.getBoundingClientRect();
      const spaceAbove = rect.top;
      const placeAbove = spaceAbove >= bh + 12;
      let top = placeAbove ? rect.top - bh - 8 : rect.bottom + 8;
      let left = align === 'end' ? rect.right - bw : rect.left;
      left = Math.max(PAD, Math.min(left, window.innerWidth - bw - PAD));
      top = Math.max(PAD, Math.min(top, window.innerHeight - bh - PAD));
      setPos({ top, left, place: placeAbove ? 'above' : 'below' });
    };
    place();
    // 再测一次：首次 hidden 测量宽度不准
    requestAnimationFrame(place);
    const onRe = () => place();
    window.addEventListener('resize', onRe);
    window.addEventListener('scroll', onRe, true);
    return () => {
      window.removeEventListener('resize', onRe);
      window.removeEventListener('scroll', onRe, true);
    };
  }, [open, anchorEl, align, actions.length, quickEmojis?.length, phraseKeys?.length, moreEmoji]);

  useLayoutEffect(() => {
    if (!open) {
      setMoreEmoji(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !actions.length) return null;

  const primary = (quickEmojis || []).slice(0, 6);
  const extra = (quickEmojis || []).slice(6);
  const showExpand = extra.length > 0 || (phraseKeys && phraseKeys.length > 0);

  return (
    <AppBodyPortal>
      <div className="im-msg-popover-root" role="dialog" aria-label="消息操作">
        <button
          type="button"
          className="im-msg-popover-backdrop"
          aria-label="关闭"
          onClick={onClose}
        />
        <div
          ref={barRef}
          className={`im-msg-popover${pos?.place === 'below' ? ' is-below' : ' is-above'}${align === 'end' ? ' is-end' : ' is-start'}`}
          style={
            pos
              ? { top: pos.top, left: pos.left, visibility: 'visible' }
              : { top: 0, left: 0, visibility: 'hidden' }
          }
          onClick={(e) => e.stopPropagation()}
        >
          {primary.length && onEmoji ? (
            <div className="im-msg-popover-emojis">
              {primary.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="im-msg-popover-emoji"
                  onClick={() => {
                    onEmoji(e);
                    onClose();
                  }}
                >
                  {e}
                </button>
              ))}
              {showExpand ? (
                <button
                  type="button"
                  className="im-msg-popover-emoji is-more"
                  aria-label={moreEmoji ? '收起' : '更多表情'}
                  onClick={() => setMoreEmoji((v) => !v)}
                >
                  {moreEmoji ? '▴' : '···'}
                </button>
              ) : null}
            </div>
          ) : null}
          {moreEmoji && onEmoji ? (
            <div className="im-msg-popover-emojis is-extra">
              {extra.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="im-msg-popover-emoji"
                  onClick={() => {
                    onEmoji(e);
                    onClose();
                  }}
                >
                  {e}
                </button>
              ))}
              {(phraseKeys || []).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="im-msg-popover-phrase"
                  onClick={() => {
                    onEmoji(p.key);
                    onClose();
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="im-msg-popover-actions">
            {actions.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`im-msg-popover-item${a.danger ? ' is-danger' : ''}`}
                onClick={() => {
                  a.onClick();
                  onClose();
                }}
              >
                <span className="im-msg-popover-label">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppBodyPortal>
  );
}
