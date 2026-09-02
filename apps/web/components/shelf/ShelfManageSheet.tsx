'use client';

import { useEffect, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import type { ShelfBookSummary, ShelfGroup } from '@/lib/shelf_api';
import {
  adminArchiveShelfBook,
  adminCreateShelfGroup,
  adminListShelfGroups,
  adminMoveShelfBook,
  adminRenameShelfBook,
} from '@/lib/shelf_admin';

type Props = {
  book: ShelfBookSummary | null;
  groups: ShelfGroup[];
  onClose: () => void;
  onChanged: () => void;
};

type Mode = 'menu' | 'rename' | 'group';

export default function ShelfManageSheet({ book, groups, onClose, onChanged }: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('menu');
  const [title, setTitle] = useState('');
  const [groupList, setGroupList] = useState(groups);
  const [busy, setBusy] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');

  useEffect(() => {
    if (!book) return;
    setTitle(book.title);
    setMode('menu');
    setGroupList(groups);
    setNewGroupTitle('');
  }, [book, groups]);

  if (!book) return null;

  const closeAll = () => {
    if (busy) return;
    onClose();
  };

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast(okMsg);
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    const ok = await confirm({
      title: '下架此书？',
      message: `「${book.title}」将从书架移除，全员不可见。文件仍保留在服务器，可重新上传入库。`,
      confirmLabel: '下架删除',
      danger: true,
    });
    if (!ok) return;
    await run(() => adminArchiveShelfBook(book.id), '已下架');
  };

  const handleRename = async () => {
    const next = title.trim();
    if (!next || next === book.title) {
      closeAll();
      return;
    }
    await run(() => adminRenameShelfBook(book.id, next), '已改名');
  };

  const handleMoveGroup = async (groupId: string) => {
    if (groupId === (book.group_id || 'default')) {
      closeAll();
      return;
    }
    await run(() => adminMoveShelfBook(book.id, groupId), '已移动分组');
  };

  const handleCreateGroup = async () => {
    const t = newGroupTitle.trim();
    if (!t) return;
    setBusy(true);
    try {
      const g = await adminCreateShelfGroup(t);
      const latest = await adminListShelfGroups();
      setGroupList(latest);
      setNewGroupTitle('');
      await adminMoveShelfBook(book.id, g.id);
      toast('已创建分组并移动');
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppBodyPortal onTabAway={closeAll}>
      <div className="sheet-backdrop" onClick={closeAll}>
        <div className="sheet card shelf-manage-sheet" onClick={(e) => e.stopPropagation()}>
          {mode === 'menu' ? (
            <>
              <h3 className="shelf-manage-title">{book.title}</h3>
              <p className="muted shelf-manage-hint">管理员操作</p>
              <div className="shelf-manage-actions">
                <button type="button" className="shelf-manage-btn" onClick={() => setMode('rename')}>
                  改名
                </button>
                <button type="button" className="shelf-manage-btn" onClick={() => setMode('group')}>
                  移动分组
                </button>
                <button type="button" className="shelf-manage-btn danger" onClick={() => void handleArchive()}>
                  下架删除
                </button>
              </div>
              <button type="button" className="font-pill shelf-manage-cancel" onClick={closeAll}>
                取消
              </button>
            </>
          ) : null}

          {mode === 'rename' ? (
            <>
              <h3 className="shelf-manage-title">改名</h3>
              <input
                className="shelf-manage-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                autoFocus
              />
              <div className="shelf-manage-row">
                <button type="button" className="font-pill" onClick={() => setMode('menu')} disabled={busy}>
                  返回
                </button>
                <button type="button" className="btn" onClick={() => void handleRename()} disabled={busy}>
                  保存
                </button>
              </div>
            </>
          ) : null}

          {mode === 'group' ? (
            <>
              <h3 className="shelf-manage-title">移动分组</h3>
              <div className="shelf-manage-group-list">
                {groupList.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`shelf-manage-group-item${g.id === (book.group_id || 'default') ? ' is-current' : ''}`}
                    onClick={() => void handleMoveGroup(g.id)}
                    disabled={busy}
                  >
                    {g.title}
                  </button>
                ))}
              </div>
              <div className="shelf-manage-new-group">
                <input
                  className="shelf-manage-input"
                  placeholder="新建分组名称"
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  maxLength={24}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleCreateGroup()}
                  disabled={busy || !newGroupTitle.trim()}
                >
                  创建并移入
                </button>
              </div>
              <button type="button" className="font-pill shelf-manage-cancel" onClick={() => setMode('menu')}>
                返回
              </button>
            </>
          ) : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
