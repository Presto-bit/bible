'use client';

import { useEffect, useState } from 'react';
import { shelfAssetUrl, type ShelfAttachment } from '@/lib/shelf_api';
import AppBodyPortal from '@/components/AppBodyPortal';
import ShelfVideoFullscreen from '@/components/shelf/ShelfVideoFullscreen';

type Props = {
  open: boolean;
  bookId: string;
  images: ShelfAttachment[];
  videos: ShelfAttachment[];
  audios?: ShelfAttachment[];
  onClose: () => void;
  initialVideo?: ShelfAttachment | null;
  onVideoConsumed?: () => void;
};

export default function ShelfMediaSheet({
  open,
  bookId,
  images,
  videos,
  audios = [],
  onClose,
  initialVideo = null,
  onVideoConsumed,
}: Props) {
  const [video, setVideo] = useState<ShelfAttachment | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  useEffect(() => {
    if (initialVideo) setVideo(initialVideo);
  }, [initialVideo]);

  if (!open) return null;

  const empty = videos.length === 0 && images.length === 0 && audios.length === 0;

  return (
    <>
      <AppBodyPortal>
        <div className="sheet-backdrop" onClick={onClose}>
          <div className="sheet card shelf-media-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <strong style={{ fontSize: 15 }}>本课素材</strong>
              <button type="button" className="text-link" onClick={onClose}>
                关闭
              </button>
            </div>

            {audios.length > 0 ? (
              <section className="shelf-media-section">
                <h3>音频</h3>
                <div className="shelf-media-audio-list">
                  {audios.map((item) => (
                    <div key={item.id} className="shelf-media-audio-item">
                      <span className="shelf-media-audio-title">{item.title}</span>
                      <audio
                        controls
                        preload="metadata"
                        src={shelfAssetUrl(bookId, item.storage_key)}
                        className="shelf-media-audio-player"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {videos.length > 0 ? (
              <section className="shelf-media-section">
                <h3>视频</h3>
                <div className="shelf-media-video-list">
                  {videos.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="shelf-media-tile"
                      onClick={() => setVideo(item)}
                    >
                      <span className="shelf-media-play" aria-hidden>
                        ▶
                      </span>
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {images.length > 0 ? (
              <section className="shelf-media-section">
                <h3>图片</h3>
                <div className="shelf-lesson-image-grid">
                  {images.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="shelf-lesson-image-tile shelf-media-tile"
                      onClick={() => setExpandedImage(item.id)}
                    >
                      <img src={shelfAssetUrl(bookId, item.storage_key)} alt={item.title} loading="lazy" />
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {empty ? <p className="muted">暂无素材</p> : null}
          </div>
        </div>
      </AppBodyPortal>

      <ShelfVideoFullscreen
        open={Boolean(video)}
        src={video ? shelfAssetUrl(bookId, video.storage_key) : ''}
        title={video?.title || '视频'}
        onClose={() => {
          setVideo(null);
          onVideoConsumed?.();
        }}
      />

      {expandedImage ? (
        <AppBodyPortal>
          <div
            className="shelf-lesson-lightbox shelf-fullscreen-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="查看大图"
            onClick={() => setExpandedImage(null)}
          >
            <img
              src={shelfAssetUrl(
                bookId,
                images.find((i) => i.id === expandedImage)?.storage_key ?? '',
              )}
              alt=""
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              className="shelf-pdf-toolbar-btn shelf-lesson-lightbox-close"
              aria-label="关闭"
              onClick={() => setExpandedImage(null)}
            >
              ✕
            </button>
          </div>
        </AppBodyPortal>
      ) : null}
    </>
  );
}
