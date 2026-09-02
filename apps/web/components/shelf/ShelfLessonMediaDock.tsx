'use client';

import type { ShelfAttachment } from '@/lib/shelf_api';

type Props = {
  videos: ShelfAttachment[];
  images: ShelfAttachment[];
  audios: ShelfAttachment[];
  onOpenAll: () => void;
  onOpenVideo?: (item: ShelfAttachment) => void;
};

export default function ShelfLessonMediaDock({
  videos,
  images,
  audios,
  onOpenAll,
  onOpenVideo,
}: Props) {
  const total = videos.length + images.length + audios.length;
  if (total === 0) return null;

  const summary =
    videos.length > 0 && images.length === 0 && audios.length === 0
      ? `${videos.length} 个视频`
      : images.length > 0 && videos.length === 0 && audios.length === 0
        ? `${images.length} 张图片`
        : `${total} 项素材`;

  return (
    <div className="shelf-lesson-media-dock" role="region" aria-label="本课素材">
      <button type="button" className="shelf-lesson-media-dock-all" onClick={onOpenAll}>
        <span className="shelf-lesson-media-dock-label">本课素材</span>
        <span className="shelf-lesson-media-dock-count">{summary}</span>
      </button>
      <div className="shelf-lesson-media-dock-scroll">
        {videos.map((item) => (
          <button
            key={item.id}
            type="button"
            className="shelf-lesson-media-dock-chip shelf-lesson-media-dock-chip-video"
            onClick={() => (onOpenVideo ? onOpenVideo(item) : onOpenAll())}
          >
            <span className="shelf-lesson-media-dock-play" aria-hidden>
              ▶
            </span>
            <span>{item.title}</span>
          </button>
        ))}
        {audios.map((item) => (
          <button
            key={item.id}
            type="button"
            className="shelf-lesson-media-dock-chip"
            onClick={onOpenAll}
          >
            <span aria-hidden>🎵</span>
            <span>{item.title}</span>
          </button>
        ))}
        {images.map((item) => (
          <button
            key={item.id}
            type="button"
            className="shelf-lesson-media-dock-chip"
            onClick={onOpenAll}
          >
            <span aria-hidden>🖼</span>
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
