'use client';

import { useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import {
  createShelfUserGroup,
  deleteShelfUserGroup,
  listShelfUserGroups,
  renameShelfUserGroup,
  setShelfBookUserGroup,
  type ShelfUserGroup,
} from '@/lib/shelf_library';
import type { ShelfBookSummary } from '@/lib/shelf_api';
import { shellTapProps } from '@/lib/shell_tap';

type Props = {
  mode: 'new_group' | 'move_book' | 'edit_group';
  book?: ShelfBookSummary | null;
  group?: ShelfUserGroup | null;
  onClose: () => void;
  onChanged: () => void;
};

export default function ShelfLibrarySheet({ mode, book, group, onClose, onChanged }: Props) {
  const [title, setTitle] = useState(mode === 'edit_group' ? group?.title ?? '' : '');
  const [err, setErr] = useState('');
  const groups = listShelfUserGroups();

  const saveNewGroup = () => {
    const g = createShelfUserGroup(title);
    if (!g) {
      setErr('无法创建分组（名称无效或已达上限）');
      return;
    }
    onChanged();
    onClose();
  };

  const saveRename = () => {
    if (!group) return;
    if (!renameShelfUserGroup(group.id, title)) {
      setErr('名称无效');
      return;
    }
    onChanged();
    onClose();
  };

  const deleteGroup = () => {
    if (!group) return;
    deleteShelfUserGroup(group.id);
    onChanged();
    onClose();
  };

  return (
    <AppBodyPortal>
      <div className="shelf-sheet-backdrop" onClick={onClose} role="presentation" />
      <div className="shelf-library-sheet" role="dialog" aria-modal="true">
        {mode === 'new_group' ? (
          <>
            <h2 className="shelf-manage-title">新建分组</h2>
            <input
              className="shelf-manage-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="分组名称"
              maxLength={20}
            />
            {err ? <p className="muted">{err}</p> : null}
            <div className="shelf-manage-row">
              <button type="button" className="btn ghost" {...shellTapProps({ onTap: onClose })}>取消</button>
              <button type="button" className="btn primary" {...shellTapProps({ onTap: saveNewGroup })}>创建</button>
            </div>
          </>
        ) : null}

        {mode === 'edit_group' && group ? (
          <>
            <h2 className="shelf-manage-title">编辑分组</h2>
            <input
              className="shelf-manage-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={20}
            />
            {err ? <p className="muted">{err}</p> : null}
            <div className="shelf-manage-actions">
              <button type="button" className="shelf-manage-btn danger" {...shellTapProps({ onTap: deleteGroup })}>
                删除分组（书移至未分组）
              </button>
            </div>
            <div className="shelf-manage-row">
              <button type="button" className="btn ghost" {...shellTapProps({ onTap: onClose })}>取消</button>
              <button type="button" className="btn primary" {...shellTapProps({ onTap: saveRename })}>保存</button>
            </div>
          </>
        ) : null}

        {mode === 'move_book' && book ? (
          <>
            <h2 className="shelf-manage-title">移到分组</h2>
            <p className="shelf-manage-hint muted">{book.title}</p>
            <div className="shelf-manage-group-list">
              <button
                type="button"
                className="shelf-manage-group-item"
                {...shellTapProps({
                  onTap: () => {
                    setShelfBookUserGroup(book.id, null);
                    onChanged();
                    onClose();
                  },
                })}
              >
                未分组
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="shelf-manage-group-item"
                  {...shellTapProps({
                    onTap: () => {
                      setShelfBookUserGroup(book.id, g.id);
                      onChanged();
                      onClose();
                    },
                  })}
                >
                  {g.title}
                </button>
              ))}
            </div>
            <button type="button" className="btn ghost shelf-manage-cancel" {...shellTapProps({ onTap: onClose })}>
              取消
            </button>
          </>
        ) : null}
      </div>
    </AppBodyPortal>
  );
}
