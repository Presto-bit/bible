'use client';

import { formatFileSize, type PendingAttach } from '@/lib/im_composer';
import { IconFile } from '@/components/social/ImComposerIcons';

type Props = {
  pending: PendingAttach;
  busy?: boolean;
  progress?: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ImAttachPreview({
  pending,
  busy,
  progress = 0,
  onCancel,
  onConfirm,
}: Props) {
  const { file, previewUrl } = pending;
  const isImg = file.type.startsWith('image/');

  return (
    <div className="im-attach-preview">
      <div className="im-attach-preview-media">
        {isImg && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="im-attach-preview-thumb" />
        ) : (
          <div className="im-attach-preview-file">
            <IconFile />
          </div>
        )}
        <div className="im-attach-preview-meta">
          <strong className="im-attach-preview-name">{file.name}</strong>
          <span className="muted">{formatFileSize(file.size)}</span>
          {busy ? <span className="muted">上传 {progress}%</span> : null}
        </div>
      </div>
      <div className="im-attach-preview-actions">
        <button type="button" className="text-link" disabled={busy} onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="im-composer-send"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? '…' : '发送'}
        </button>
      </div>
    </div>
  );
}
