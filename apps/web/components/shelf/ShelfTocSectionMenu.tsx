'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import {
  deleteCollectionSection,
  reorderPlatformSections,
  updateCollectionSection,
} from '@/lib/shelf_api';
import { shellTapProps } from '@/lib/shell_tap';

type Props = {
  open: boolean;
  bookId: string;
  sectionId: string;
  sectionTitle: string;
  sectionIds: string[];
  isCollection?: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onChanged: () => void;
};

export default function ShelfTocSectionMenu({
  open,
  bookId,
  sectionId,
  sectionTitle,
  sectionIds,
  isCollection = false,
  anchorEl,
  onClose,
  onChanged,
}: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const barRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [title, setTitle] = useState(sectionTitle);
  const [busy, setBusy] = useState(false);

  const index = useMemo(() => sectionIds.indexOf(sectionId), [sectionIds, sectionId]);
  const canMoveUp = index > 0;
  const canMoveDown = index >= 0 && index < sectionIds.length - 1;
  const canRemoveToc = sectionIds.length > 1;

  useEffect(() => {
    if (open) {
      setTitle(sectionTitle);
      setRenameOpen(false);
    }
  }, [open, sectionTitle]);

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPos(null);
      return;
    }
    const place = () => {
      const bar = barRef.current;
      const bw = bar?.offsetWidth || 200;
      const bh = bar?.offsetHeight || 160;
      const rect = anchorEl.getBoundingClientRect();
      let top = rect.top - bh - 8;
      let left = rect.left;
      if (top < 12) top = rect.bottom + 8;
      left = Math.max(12, Math.min(left, window.innerWidth - bw - 12));
      setPos({ top, left });
    };
    place();
    requestAnimationFrame(place);
  }, [open, anchorEl, renameOpen]);

  const saveRename = async () => {
    const next = title.trim();
    if (!next) {
      toast('标题不能为空');
      return;
    }
    setBusy(true);
    try {
      await updateCollectionSection(bookId, sectionId, { title: next });
      toast('已更新');
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const move = async (dir: -1 | 1) => {
    if (index < 0) return;
    const next = index + dir;
    if (next < 0 || next >= sectionIds.length) return;
    const ordered = [...sectionIds];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item);
    setBusy(true);
    try {
      await reorderPlatformSections(bookId, ordered);
      toast(dir < 0 ? '已上移' : '已下移');
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '调整顺序失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!canRemoveToc) {
      toast('仅剩一节，无法删除目录');
      return;
    }
    const ok = await confirm({
      title: isCollection ? `删除「${sectionTitle}」？` : `从目录移除「${sectionTitle}」？`,
      message: isCollection
        ? '将从合集中移除，并删除对应文件。此操作不可恢复。'
        : '仅删除目录项，正文会自动合并到上一节（首节则并入下一节），不会丢失内容。',
      confirmLabel: isCollection ? '删除' : '移除并合并',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await deleteCollectionSection(bookId, sectionId);
      toast(isCollection || !res.merged ? '已删除' : '已移除目录，正文已合并');
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div className="shelf-book-action-root" role="dialog" aria-label="目录操作">
        <button type="button" className="shelf-book-action-backdrop" aria-label="关闭" onClick={onClose} />
        <div
          ref={barRef}
          className="shelf-book-action-popover shelf-toc-section-menu"
          style={pos ? { top: pos.top, left: pos.left, visibility: 'visible' } : { top: 0, left: 0, visibility: 'hidden' }}
          onClick={(e) => e.stopPropagation()}
        >
          {renameOpen ? (
            <>
              <p className="shelf-book-action-title">改名</p>
              <input
                className="shelf-manage-input"
                value={title}
                maxLength={120}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
              <div className="shelf-manage-row">
                <button type="button" className="font-pill" disabled={busy} {...shellTapProps({ onTap: () => setRenameOpen(false) })}>
                  返回
                </button>
                <button type="button" className="btn" disabled={busy} {...shellTapProps({ onTap: () => void saveRename() })}>
                  保存
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="shelf-book-action-title">{sectionTitle}</p>
              <div className="shelf-book-action-list">
                <button type="button" className="shelf-book-action-item" {...shellTapProps({ onTap: () => setRenameOpen(true) })}>
                  改名
                </button>
                {canMoveUp ? (
                  <button
                    type="button"
                    className="shelf-book-action-item"
                    disabled={busy}
                    {...shellTapProps({ onTap: () => void move(-1) })}
                  >
                    上移
                  </button>
                ) : null}
                {canMoveDown ? (
                  <button
                    type="button"
                    className="shelf-book-action-item"
                    disabled={busy}
                    {...shellTapProps({ onTap: () => void move(1) })}
                  >
                    下移
                  </button>
                ) : null}
                {canRemoveToc ? (
                  <button type="button" className="shelf-book-action-item is-danger" {...shellTapProps({ onTap: () => void remove() })}>
                    {isCollection ? '删除此节' : '移除目录（合并正文）'}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </AppBodyPortal>
  );
}
