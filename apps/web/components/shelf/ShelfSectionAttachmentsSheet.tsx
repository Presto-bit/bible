'use client';

import { useId, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import {
  appendSectionAttachments,
  deleteSectionAttachment,
  shelfAssetUrl,
  type ShelfAttachment,
} from '@/lib/shelf_api';
import { invalidateShelfBookCache } from '@/lib/shelf_cache';
import { shellTapProps } from '@/lib/shell_tap';

const MEDIA_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mov';
const MAX_MEDIA_BYTES = 80 * 1024 * 1024;
const MAX_MEDIA_COUNT = 20;

type Props = {
  bookId: string;
  sectionId: string;
  sectionTitle: string;
  attachments: ShelfAttachment[];
  onClose: () => void;
  onChanged: () => void;
};

export default function ShelfSectionAttachmentsSheet({
  bookId,
  sectionId,
  sectionTitle,
  attachments,
  onClose,
  onChanged,
}: Props) {
  const flashToast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState(attachments);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const batch: File[] = [];
    for (const file of Array.from(files)) {
      if (items.length + batch.length >= MAX_MEDIA_COUNT) {
        flashToast(`本课素材最多 ${MAX_MEDIA_COUNT} 个`);
        break;
      }
      if (file.size > MAX_MEDIA_BYTES) {
        flashToast(`${file.name} 超过 80MB，已跳过`);
        continue;
      }
      batch.push(file);
    }
    if (!batch.length) return;
    setBusy(true);
    try {
      const res = await appendSectionAttachments(bookId, sectionId, batch);
      setItems(res.attachments ?? []);
      invalidateShelfBookCache(bookId);
      onChanged();
      flashToast(`已添加 ${res.added?.length ?? batch.length} 项素材`);
    } catch (e) {
      flashToast(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (att: ShelfAttachment) => {
    const ok = await confirm({
      title: `删除「${att.title}」？`,
      message: '素材将从本课移除并删除服务器文件。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await deleteSectionAttachment(bookId, sectionId, att.id);
      setItems(res.attachments ?? []);
      invalidateShelfBookCache(bookId);
      onChanged();
      flashToast('已删除');
    } catch (e) {
      flashToast(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div className="shelf-sheet-backdrop" onClick={onClose} role="presentation" />
      <div className="shelf-import-sheet" role="dialog" aria-modal="true" aria-label="管理课节素材">
        <div className="shelf-import-head">
          <strong>本课素材</strong>
          <button type="button" className="icon-btn" aria-label="关闭" {...shellTapProps({ onTap: onClose })}>
            ✕
          </button>
        </div>
        <p className="shelf-import-hint muted">「{sectionTitle}」的图卡与视频。阅读时会出现在「本课素材」入口。</p>

        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={MEDIA_ACCEPT}
          multiple
          className="shelf-import-file"
          disabled={busy}
          onChange={(e) => void upload(e.target.files)}
        />
        <label
          htmlFor={busy ? undefined : inputId}
          className={`btn primary shelf-import-btn${busy ? ' is-disabled' : ''}`}
          aria-disabled={busy}
        >
          {busy ? '处理中…' : '添加素材'}
        </label>

        {items.length === 0 ? (
          <p className="muted shelf-import-hint">还没有素材</p>
        ) : (
          <ul className="shelf-append-media-list">
            {items.map((att) => (
              <li key={att.id} className="shelf-append-media-item">
                <span>
                  {att.kind === 'video' ? '▶ ' : '🖼 '}
                  {att.title}
                </span>
                <div className="shelf-manage-section-actions">
                  {att.kind === 'image' ? (
                    <a
                      className="text-link"
                      href={shelfAssetUrl(bookId, att.storage_key)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      预览
                    </a>
                  ) : null}
                  <button type="button" className="text-link is-danger" disabled={busy} onClick={() => void remove(att)}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppBodyPortal>
  );
}
