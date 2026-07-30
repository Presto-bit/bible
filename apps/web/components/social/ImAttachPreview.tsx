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
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');

  return (
    <div className="im-attach-preview">
      <div className="im-attach-preview-media">
        {isImg && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="im-attach-preview-thumb" />
        ) : isVideo && previewUrl ? (
          <video src={previewUrl} className="im-attach-preview-thumb" muted playsInline preload="metadata" />
        ) : (
          <div className="im-attach-preview-file">
            <IconFile />
            {isAudio ? <span className="muted" style={{ fontSize: 11 }}>语音</span> : null}
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
