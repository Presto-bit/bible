'use client';

import { useEffect, useRef } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';

type Props = {
  open: boolean;
  src: string;
  title: string;
  onClose: () => void;
};

export default function ShelfVideoFullscreen({ open, src, title, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (!v) return;
    void v.play().catch(() => {});
    const el = v as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (typeof el.requestFullscreen === 'function') {
      void el.requestFullscreen().catch(() => {});
    } else if (typeof el.webkitEnterFullscreen === 'function') {
      el.webkitEnterFullscreen();
    }
    return () => {
      v.pause();
    };
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <AppBodyPortal>
      <div className="shelf-fullscreen-overlay" role="dialog" aria-modal="true" aria-label={title}>
        <header className="shelf-fullscreen-head">
          <strong>{title}</strong>
          <button type="button" className="shelf-pdf-toolbar-btn" aria-label="关闭" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="shelf-fullscreen-body">
          <video
            ref={videoRef}
            className="shelf-fullscreen-video"
            controls
            playsInline
            preload="auto"
            src={src}
          >
            您的浏览器不支持视频播放
          </video>
        </div>
      </div>
    </AppBodyPortal>
  );
}
