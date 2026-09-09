'use client';

import { useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useToast } from '@/components/ui/ToastProvider';
import { createPlatformCollection, importPlatformShelfBook } from '@/lib/shelf_api';
import { invalidateShelfListCache } from '@/lib/shelf_cache';
import { SHELF_IMPORT_MAX_BYTES } from '@/lib/shelf_library';
import { shellTapProps } from '@/lib/shell_tap';

const ACCEPT =
  '.docx,.txt,.md,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Mode = 'book' | 'collection';

export default function ShelfImportSheet({ onClose }: { onClose: () => void }) {
  const flashToast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('book');
  const [busy, setBusy] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('');
  const [collectionSubtitle, setCollectionSubtitle] = useState('');

  const onPick = async (file: File | null) => {
    if (!file) return;
    if (file.size > SHELF_IMPORT_MAX_BYTES) {
      flashToast('单本不超过 20MB，可先拆章或转为 txt');
      return;
    }
    setBusy(true);
    try {
      const res = await importPlatformShelfBook(file);
      invalidateShelfListCache();
      flashToast(`已导入「${res.title}」`);
      onClose();
      window.location.reload();
    } catch (e) {
      flashToast(e instanceof Error ? e.message : '导入失败');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
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
          <strong>{mode === 'book' ? '上传书籍' : '创建合集'}</strong>
          <button type="button" className="icon-btn" aria-label="关闭" {...shellTapProps({ onTap: onClose })}>✕</button>
        </div>

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

        {mode === 'book' ? (
          <>
            <p className="shelf-import-hint muted">
              支持 docx、txt、md、pdf，单本不超过 20MB。导入后将出现在「上架时间」。
            </p>
            <input
              id="shelf-import-file"
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="shelf-import-file"
              disabled={busy}
              onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor={busy ? undefined : 'shelf-import-file'}
              className={`btn primary shelf-import-btn${busy ? ' is-disabled' : ''}`}
              aria-disabled={busy}
            >
              {busy ? '处理中…' : '选择文件'}
            </label>
          </>
        ) : (
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
        )}
      </div>
    </AppBodyPortal>
  );
}
