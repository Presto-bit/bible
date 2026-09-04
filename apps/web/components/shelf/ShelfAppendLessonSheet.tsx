'use client';

import { useEffect, useId, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useToast } from '@/components/ui/ToastProvider';
import {
  adminAppendCollectionLesson,
  adminListCollectionUnits,
} from '@/lib/shelf_admin';
import { invalidateShelfListCache } from '@/lib/shelf_cache';
import { shellTapProps } from '@/lib/shell_tap';

const ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 50 * 1024 * 1024;

type Props = {
  bookId: string;
  bookTitle: string;
  onClose: () => void;
  onAdded?: (sectionId: string) => void;
};

export default function ShelfAppendLessonSheet({ bookId, bookTitle, onClose, onAdded }: Props) {
  const flashToast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [units, setUnits] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    void adminListCollectionUnits(bookId)
      .then(setUnits)
      .catch(() => setUnits([]));
  }, [bookId]);

  const onPick = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      flashToast('单课不超过 50MB');
      return;
    }
    const lower = (file.name || '').toLowerCase();
    if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
      flashToast('暂不支持旧版 .doc，请另存为 .docx 后再上传');
      return;
    }
    setBusy(true);
    try {
      const res = await adminAppendCollectionLesson(bookId, file, {
        title: title.trim() || undefined,
        unit: unit.trim() || undefined,
        zone: 'body',
      });
      invalidateShelfListCache();
      const addedTitle = res.section?.title || file.name || '新课节';
      const addedId = res.section?.id;
      onClose();
      // 关层后再提示，避免被弹层挡住
      window.setTimeout(() => {
        flashToast(`上传成功：已加入「${addedTitle}」`);
      }, 40);
      if (addedId) onAdded?.(addedId);
    } catch (e) {
      flashToast(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
      setFileName('');
    }
  };

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div className="shelf-sheet-backdrop" onClick={onClose} role="presentation" />
      <div className="shelf-import-sheet" role="dialog" aria-modal="true" aria-label="添加课节">
        <div className="shelf-import-head">
          <strong>添加课节</strong>
          <button type="button" className="icon-btn" aria-label="关闭" {...shellTapProps({ onTap: onClose })}>
            ✕
          </button>
        </div>
        <p className="shelf-import-hint muted">
          向《{bookTitle}》追加一课。请使用 <strong>.docx</strong> 或 PDF（旧版 .doc 需先另存为 docx）。
        </p>
        <label className="shelf-append-field">
          <span className="muted">标题（可选）</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="默认用文件名"
            disabled={busy}
          />
        </label>
        <label className="shelf-append-field">
          <span className="muted">单元（可选）</span>
          <input
            type="text"
            list={`shelf-units-${bookId}`}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="如：第四单元"
            disabled={busy}
          />
          <datalist id={`shelf-units-${bookId}`}>
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="shelf-import-file"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFileName(f?.name || '');
            void onPick(f);
          }}
        />
        {/* label 关联 file input：比 button + input.click() 在 iOS/WebView 更稳 */}
        <label
          htmlFor={busy ? undefined : inputId}
          className={`btn primary shelf-import-btn${busy ? ' is-disabled' : ''}`}
          aria-disabled={busy}
        >
          {busy ? '上传中…' : fileName ? `已选 ${fileName}` : '选择 PDF / Word'}
        </label>
      </div>
    </AppBodyPortal>
  );
}
