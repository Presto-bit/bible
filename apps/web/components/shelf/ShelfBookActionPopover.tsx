'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppBodyPortal from '@/components/AppBodyPortal';
import type { ShelfBookSummary } from '@/lib/shelf_api';
import { shelfBookDetailHref, shelfBookReadHref } from '@/lib/shelf_library';
import { navigateAppHref } from '@/lib/pwa_tab_nav';
import { shellTapProps } from '@/lib/shell_tap';
import { shelfIsChildrenLessonBook } from '@/lib/shelf_reader_contract';

export type ShelfBookAction = {
  id: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
};

type Props = {
  open: boolean;
  book: ShelfBookSummary;
  anchorEl: HTMLElement | null;
  canManage?: boolean;
  canAppendLesson?: boolean;
  onClose: () => void;
  onMoveGroup: (book: ShelfBookSummary) => void;
  onShare?: (book: ShelfBookSummary) => void;
  onManage?: (book: ShelfBookSummary) => void;
  onAppendLesson?: (book: ShelfBookSummary) => void;
};

const PAD = 12;

/**
 * 书架长按：锚定在书籍卡片附近的轻量操作条。
 */
export default function ShelfBookActionPopover({
  open,
  book,
  anchorEl,
  canManage,
  canAppendLesson,
  onClose,
  onMoveGroup,
  onShare,
  onManage,
  onAppendLesson,
}: Props) {
  const router = useRouter();
  const barRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; place: 'above' | 'below' } | null>(
    null,
  );

  const actions: ShelfBookAction[] = [
    {
      id: 'read',
      label: '继续阅读',
      onClick: () => navigateAppHref(shelfBookReadHref(book.id), router),
    },
    {
      id: 'detail',
      label: '书籍详情',
      onClick: () => navigateAppHref(shelfBookDetailHref(book.id), router),
    },
    ...(canAppendLesson &&
    (book.book_type === 'collection' || shelfIsChildrenLessonBook(book)) &&
    onAppendLesson
      ? [{
          id: 'append',
          label: '添加课节',
          onClick: () => onAppendLesson(book),
        }]
      : []),
    ...(onShare
      ? [{
          id: 'share',
          label: '分享到群',
          onClick: () => onShare(book),
        }]
      : []),
    {
      id: 'move',
      label: '移到分组',
      onClick: () => onMoveGroup(book),
    },
  ];

  if (canManage && onManage) {
    actions.push({
      id: 'manage',
      label: '管理此书',
      onClick: () => onManage(book),
    });
  }

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const bar = barRef.current;
      const bw = bar?.offsetWidth || Math.min(240, window.innerWidth - PAD * 2);
      const bh = bar?.offsetHeight || 160;
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
      const placeAbove = spaceAbove >= bh + 14;
      let top = placeAbove ? rect.top - bh - 10 : rect.bottom + 10;
      let left = rect.left + rect.width / 2 - bw / 2;
      left = Math.max(PAD, Math.min(left, window.innerWidth - bw - PAD));
      top = Math.max(PAD, Math.min(top, window.innerHeight - bh - PAD));
      setPos({ top, left, place: placeAbove ? 'above' : 'below' });
    };
    place();
    requestAnimationFrame(place);
    const onRe = () => place();
    window.addEventListener('resize', onRe);
    window.addEventListener('scroll', onRe, true);
    return () => {
      window.removeEventListener('resize', onRe);
      window.removeEventListener('scroll', onRe, true);
    };
  }, [open, anchorEl, actions.length]);

  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const close = () => onClose();
    window.addEventListener('presto-tab-nav', close);
    window.addEventListener('popstate', close);
    return () => {
      window.removeEventListener('presto-tab-nav', close);
      window.removeEventListener('popstate', close);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !anchorEl) return;
    const closeIfOrphaned = () => {
      if (!anchorEl.isConnected || anchorEl.closest('[hidden]')) onClose();
    };
    closeIfOrphaned();
    const obs = new MutationObserver(closeIfOrphaned);
    const pane = anchorEl.closest('.tab-keep-pane');
    if (pane) obs.observe(pane, { attributes: true, attributeFilter: ['hidden'] });
    return () => obs.disconnect();
  }, [open, anchorEl, onClose]);

  if (!open) return null;

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div className="shelf-book-action-root" role="dialog" aria-label={`${book.title} 操作`}>
        <button
          type="button"
          className="shelf-book-action-backdrop"
          aria-label="关闭"
          onClick={onClose}
        />
        <div
          ref={barRef}
          className={`shelf-book-action-popover${pos?.place === 'below' ? ' is-below' : ' is-above'}`}
          style={
            pos
              ? { top: pos.top, left: pos.left, visibility: 'visible' }
              : { top: 0, left: 0, visibility: 'hidden' }
          }
          onClick={(e) => e.stopPropagation()}
        >
          <p className="shelf-book-action-title">{book.title}</p>
          <div className="shelf-book-action-list">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`shelf-book-action-item${action.danger ? ' is-danger' : ''}`}
                {...shellTapProps({
                  onTap: () => {
                    action.onClick();
                    onClose();
                  },
                })}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppBodyPortal>
  );
}
