'use client';

import { useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useToast } from '@/components/ui/ToastProvider';
import { importPlatformShelfBook } from '@/lib/shelf_api';
import { invalidateShelfListCache } from '@/lib/shelf_cache';
import { SHELF_IMPORT_MAX_BYTES } from '@/lib/shelf_library';
import { shellTapProps } from '@/lib/shell_tap';

const ACCEPT = '.docx,.txt,.md,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function ShelfImportSheet({ onClose }: { onClose: () => void }) {
  const flashToast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <AppBodyPortal>
      <div className="shelf-sheet-backdrop" onClick={onClose} role="presentation" />
      <div className="shelf-import-sheet" role="dialog" aria-modal="true" aria-label="导入书籍">
        <div className="shelf-import-head">
          <strong>导入书籍</strong>
          <button type="button" className="icon-btn" aria-label="关闭" {...shellTapProps({ onTap: onClose })}>✕</button>
        </div>
        <p className="shelf-import-hint muted">
          支持 docx、txt、md，单本不超过 20MB。导入后将出现在「上架时间」。
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
      </div>
    </AppBodyPortal>
  );
}
