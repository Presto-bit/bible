'use client';

import { useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useToast } from '@/components/ui/ToastProvider';
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
      // P1：用户导入 API 接入前占位
      flashToast('导入功能即将开放，请先阅读平台书目');
    } finally {
      setBusy(false);
      onClose();
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
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="shelf-import-file"
          onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn primary shelf-import-btn"
          disabled={busy}
          {...shellTapProps({
            onTap: () => inputRef.current?.click(),
          })}
        >
          {busy ? '处理中…' : '选择文件'}
        </button>
      </div>
    </AppBodyPortal>
  );
}
