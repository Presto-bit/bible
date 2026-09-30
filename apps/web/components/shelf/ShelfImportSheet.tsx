'use client';

import { useEffect, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchShelfAdminCapabilities } from '@/lib/shelf_admin';
import { createPlatformCollection, importPlatformShelfBook } from '@/lib/shelf_api';
import { invalidateShelfListCache } from '@/lib/shelf_cache';
import {
  shelfImportMaxBytes,
  shelfImportMaxMbLabel,
} from '@/lib/shelf_library';
import { shellTapProps } from '@/lib/shell_tap';

const ACCEPT =
  '.docx,.txt,.md,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Mode = 'book' | 'collection';

function titleFromFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, '').trim();
  return base.replace(/\.[^.]+$/, '').trim() || base;
}

export default function ShelfImportSheet({ onClose }: { onClose: () => void }) {
  const flashToast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('book');
  const [busy, setBusy] = useState(false);
  const [isShelfAdmin, setIsShelfAdmin] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('');
  const [collectionSubtitle, setCollectionSubtitle] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookSubtitle, setBookSubtitle] = useState('');
  const maxBytes = shelfImportMaxBytes(isShelfAdmin);
  const maxMbLabel = shelfImportMaxMbLabel(isShelfAdmin);

  useEffect(() => {
    void fetchShelfAdminCapabilities().then((cap) => {
      setIsShelfAdmin(cap.shelf_admin);
    });
  }, []);

  const clearPending = () => {
    setPendingFile(null);
    setBookTitle('');
    setBookAuthor('');
    setBookSubtitle('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const onPick = (file: File | null) => {
    if (!file) return;
    if (file.size > maxBytes) {
      flashToast(`单本不超过 ${maxMbLabel}，可先拆章或转为 txt`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setPendingFile(file);
    setBookTitle(titleFromFilename(file.name));
    setBookAuthor('');
    setBookSubtitle('');
  };

  const onImport = async () => {
    if (!pendingFile || busy) return;
    setBusy(true);
    try {
      const res = await importPlatformShelfBook(pendingFile, {
        title: bookTitle,
        author: bookAuthor,
        subtitle: bookSubtitle,
      });
      invalidateShelfListCache();
      flashToast(`已导入「${res.title}」`);
      onClose();
      window.location.reload();
    } catch (e) {
      flashToast(e instanceof Error ? e.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  const onCreateCollection = async () => {
    const title = collectionTitle.trim();
    if (!title) {
      flashToast('请填写合集名称');
      return;
    }
    setBusy(true);
    try {
      const res = await createPlatformCollection({
        title,
        subtitle: collectionSubtitle.trim() || undefined,
      });
      invalidateShelfListCache();
      flashToast(`已创建合集「${res.title}」`);
      onClose();
      window.location.reload();
    } catch (e) {
      flashToast(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppBodyPortal>
      <div className="shelf-sheet-backdrop" onClick={onClose} role="presentation" />
      <div className="shelf-import-sheet" role="dialog" aria-modal="true" aria-label="导入到书架">
        <div className="shelf-import-head">
          <strong>
            {mode === 'collection'
              ? '创建合集'
              : pendingFile
                ? '确认导入'
                : '上传书籍'}
          </strong>
          <button type="button" className="icon-btn" aria-label="关闭" {...shellTapProps({ onTap: onClose })}>✕</button>
        </div>

        {!pendingFile ? (
          <div className="shelf-import-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'book'}
              className={`shelf-import-tab${mode === 'book' ? ' is-active' : ''}`}
              disabled={busy}
              {...shellTapProps({ onTap: () => setMode('book') })}
            >
              上传书籍
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'collection'}
              className={`shelf-import-tab${mode === 'collection' ? ' is-active' : ''}`}
              disabled={busy}
              {...shellTapProps({ onTap: () => setMode('collection') })}
            >
              创建合集
            </button>
          </div>
        ) : null}

        {mode === 'book' && !pendingFile ? (
          <>
            <p className="shelf-import-hint muted">
              支持 docx、txt、md、pdf，单本不超过 {maxMbLabel}。选文件后可补书名与作者（均可留空）。
            </p>
            <input
              id="shelf-import-file"
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="shelf-import-file"
              disabled={busy}
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor={busy ? undefined : 'shelf-import-file'}
              className={`btn primary shelf-import-btn${busy ? ' is-disabled' : ''}`}
              aria-disabled={busy}
            >
              选择文件
            </label>
          </>
        ) : null}

        {mode === 'book' && pendingFile ? (
          <>
            <p className="shelf-import-hint muted">
              均可留空；空书名则用文件名。导入后出现在「上架时间」。
            </p>
            <label className="shelf-import-field">
              <span className="muted">文件</span>
              <input type="text" value={pendingFile.name} readOnly disabled />
            </label>
            <label className="shelf-import-field">
              <span className="muted">书名（可选）</span>
              <input
                type="text"
                maxLength={80}
                value={bookTitle}
                disabled={busy}
                placeholder="留空则用文件名"
                onChange={(e) => setBookTitle(e.target.value)}
              />
            </label>
            <label className="shelf-import-field">
              <span className="muted">作者（可选）</span>
              <input
                type="text"
                maxLength={80}
                value={bookAuthor}
                disabled={busy}
                placeholder="作者"
                onChange={(e) => setBookAuthor(e.target.value)}
              />
            </label>
            <label className="shelf-import-field">
              <span className="muted">副标题（可选）</span>
              <input
                type="text"
                maxLength={160}
                value={bookSubtitle}
                disabled={busy}
                placeholder="一句话说明"
                onChange={(e) => setBookSubtitle(e.target.value)}
              />
            </label>
            <div className="shelf-import-confirm-actions">
              <button
                type="button"
                className="btn ghost shelf-import-btn"
                disabled={busy}
                {...shellTapProps({ onTap: clearPending })}
              >
                重选文件
              </button>
              <button
                type="button"
                className={`btn primary shelf-import-btn${busy ? ' is-disabled' : ''}`}
                disabled={busy}
                {...shellTapProps({ onTap: () => void onImport() })}
              >
                {busy ? '导入中…' : '导入'}
              </button>
            </div>
          </>
        ) : null}

        {mode === 'collection' ? (
          <>
            <p className="shelf-import-hint muted">
              先建空合集，再逐份添加 pdf 或 docx（每份不超过 50MB）。
            </p>
            <label className="shelf-import-field">
              <span className="muted">合集名称</span>
              <input
                type="text"
                maxLength={80}
                value={collectionTitle}
                disabled={busy}
                placeholder="例如：小组查经资料"
                onChange={(e) => setCollectionTitle(e.target.value)}
              />
            </label>
            <label className="shelf-import-field">
              <span className="muted">副标题（可选）</span>
              <input
                type="text"
                maxLength={160}
                value={collectionSubtitle}
                disabled={busy}
                placeholder="一句话说明"
                onChange={(e) => setCollectionSubtitle(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={`btn primary shelf-import-btn${busy ? ' is-disabled' : ''}`}
              disabled={busy}
              {...shellTapProps({ onTap: () => void onCreateCollection() })}
            >
              {busy ? '处理中…' : '创建合集'}
            </button>
          </>
        ) : null}
      </div>
    </AppBodyPortal>
  );
}
