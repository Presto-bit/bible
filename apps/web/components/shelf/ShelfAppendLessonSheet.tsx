'use client';

import { useEffect, useId, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useToast } from '@/components/ui/ToastProvider';
import { appendCollectionLesson, listCollectionUnits } from '@/lib/shelf_api';
import { invalidateShelfListCache } from '@/lib/shelf_cache';
import { shellTapProps } from '@/lib/shell_tap';

const LESSON_ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MEDIA_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mov';
const MAX_LESSON_BYTES = 50 * 1024 * 1024;
const MAX_MEDIA_BYTES = 80 * 1024 * 1024;
const MAX_MEDIA_COUNT = 20;

type Props = {
  bookId: string;
  bookTitle: string;
  onClose: () => void;
  onAdded?: (sectionId: string) => void;
};

export default function ShelfAppendLessonSheet({ bookId, bookTitle, onClose, onAdded }: Props) {
  const flashToast = useToast();
  const lessonInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const lessonInputId = useId();
  const mediaInputId = useId();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [units, setUnits] = useState<string[]>([]);
  const [lessonFile, setLessonFile] = useState<File | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);

  useEffect(() => {
    void listCollectionUnits(bookId)
      .then(setUnits)
      .catch(() => setUnits([]));
  }, [bookId]);

  const validateLesson = (file: File): string | null => {
    if (file.size > MAX_LESSON_BYTES) return '单课不超过 50MB';
    const lower = (file.name || '').toLowerCase();
    if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
      return '暂不支持旧版 .doc，请另存为 .docx 后再上传';
    }
    return null;
  };

  const onPickLesson = (file: File | null) => {
    if (!file) return;
    const err = validateLesson(file);
    if (err) {
      flashToast(err);
      return;
    }
    setLessonFile(file);
  };

  const onPickMedia = (files: FileList | null) => {
    if (!files?.length) return;
    const next: File[] = [...mediaFiles];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_MEDIA_COUNT) {
        flashToast(`素材最多 ${MAX_MEDIA_COUNT} 个`);
        break;
      }
      if (file.size > MAX_MEDIA_BYTES) {
        flashToast(`${file.name} 超过 80MB，已跳过`);
        continue;
      }
      next.push(file);
    }
    setMediaFiles(next);
    if (mediaInputRef.current) mediaInputRef.current.value = '';
  };

  const removeMedia = (index: number) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!lessonFile) {
      flashToast('请先选择课节正文（PDF 或 Word）');
      return;
    }
    const err = validateLesson(lessonFile);
    if (err) {
      flashToast(err);
      return;
    }
    setBusy(true);
    try {
      const res = await appendCollectionLesson(bookId, lessonFile, {
        title: title.trim() || undefined,
        unit: unit.trim() || undefined,
        zone: 'body',
        attachments: mediaFiles.length ? mediaFiles : undefined,
      });
      invalidateShelfListCache();
      const addedTitle = res.section?.title || lessonFile.name || '新课节';
      const addedId = res.section?.id;
      onClose();
      window.setTimeout(() => {
        const mediaHint = mediaFiles.length ? `，含 ${mediaFiles.length} 项素材` : '';
        flashToast(`上传成功：已加入「${addedTitle}」${mediaHint}`);
      }, 40);
      if (addedId) onAdded?.(addedId);
    } catch (e) {
      flashToast(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
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
          向《{bookTitle}》追加一课。正文用 <strong>PDF</strong> 或 <strong>Word</strong>；视频/图卡请加到「本课素材」。
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
          id={lessonInputId}
          ref={lessonInputRef}
          type="file"
          accept={LESSON_ACCEPT}
          className="shelf-import-file"
          disabled={busy}
          onChange={(e) => onPickLesson(e.target.files?.[0] ?? null)}
        />
        <label
          htmlFor={busy ? undefined : lessonInputId}
          className={`btn ghost shelf-import-btn${busy ? ' is-disabled' : ''}`}
          aria-disabled={busy}
        >
          {lessonFile ? `正文：${lessonFile.name}` : '选择课节正文（PDF / Word）'}
        </label>

        <input
          id={mediaInputId}
          ref={mediaInputRef}
          type="file"
          accept={MEDIA_ACCEPT}
          multiple
          className="shelf-import-file"
          disabled={busy}
          onChange={(e) => onPickMedia(e.target.files)}
        />
        <label
          htmlFor={busy ? undefined : mediaInputId}
          className={`btn ghost shelf-import-btn${busy ? ' is-disabled' : ''}`}
          aria-disabled={busy}
        >
          添加本课素材（图 / 视频，可选）
        </label>
        {mediaFiles.length > 0 ? (
          <ul className="shelf-append-media-list">
            {mediaFiles.map((f, i) => (
              <li key={`${f.name}-${i}`} className="shelf-append-media-item">
                <span>{f.name}</span>
                <button type="button" className="text-link" disabled={busy} onClick={() => removeMedia(i)}>
                  移除
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          className={`btn primary shelf-import-btn${busy || !lessonFile ? ' is-disabled' : ''}`}
          disabled={busy || !lessonFile}
          {...shellTapProps({ onTap: () => void submit() })}
        >
          {busy ? '上传中…' : '上传课节'}
        </button>
      </div>
    </AppBodyPortal>
  );
}
