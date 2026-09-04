'use client';

import { useEffect, useRef, useState } from 'react';
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
    setBusy(true);
    try {
      const res = await adminAppendCollectionLesson(bookId, file, {
        title: title.trim() || undefined,
        unit: unit.trim() || undefined,
        zone: 'body',
      });
      invalidateShelfListCache();
      flashToast(`已加入「${res.section?.title || file.name}」`);
      if (res.section?.id) onAdded?.(res.section.id);
      onClose();
    } catch (e) {
      flashToast(e instanceof Error ? e.message : '添加失败');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
      setFileName('');
    }
  };

  return (
    <AppBodyPortal>
      <div className="shelf-sheet-backdrop" onClick={onClose} role="presentation" />
      <div className="shelf-import-sheet" role="dialog" aria-modal="true" aria-label="添加课节">
        <div className="shelf-import-head">
          <strong>添加课节</strong>
          <button type="button" className="icon-btn" aria-label="关闭" {...shellTapProps({ onTap: onClose })}>
            ✕
          </button>
        </div>
        <p className="shelf-import-hint muted">
          向《{bookTitle}》追加一课。支持 PDF / Word，全员可见。
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
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="shelf-import-file"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFileName(f?.name || '');
            void onPick(f);
          }}
        />
        <button
          type="button"
          className="btn primary shelf-import-btn"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? '上传中…' : fileName ? `已选 ${fileName}` : '选择 PDF / Word'}
        </button>
      </div>
    </AppBodyPortal>
  );
}
