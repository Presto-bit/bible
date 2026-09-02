'use client';

import { useEffect, useMemo, useState } from 'react';
import { shelfAssetUrl, type ShelfAttachment, type ShelfSection } from '@/lib/shelf_api';

type Props = {
  bookId: string;
  section: ShelfSection;
};

export default function ShelfLessonPanel({ bookId, section }: Props) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const images = section.attachments?.filter((a) => a.kind === 'image') ?? [];
  const videos = section.attachments?.filter((a) => a.kind === 'video') ?? [];

  return (
    <div className="shelf-lesson">
      {section.unit ? <p className="shelf-lesson-unit">{section.unit}</p> : null}

      <ShelfPrimaryView bookId={bookId} section={section} />

      {images.length > 0 ? (
        <section className="shelf-lesson-media">
          <h2 className="shelf-lesson-media-title">图片</h2>
          <div className="shelf-lesson-image-grid">
            {images.map((item) => (
              <ShelfImageTile
                key={item.id}
                bookId={bookId}
                item={item}
                onExpand={() => setExpandedImage(item.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section className="shelf-lesson-media">
          <h2 className="shelf-lesson-media-title">视频</h2>
          <div className="shelf-lesson-video-list">
            {videos.map((item) => (
              <ShelfVideoPlayer key={item.id} bookId={bookId} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {expandedImage ? (
        <div
          className="shelf-lesson-lightbox"
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
            className="icon-btn shelf-lesson-lightbox-close"
            aria-label="关闭"
            onClick={() => setExpandedImage(null)}
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ShelfPrimaryView({ bookId, section }: { bookId: string; section: ShelfSection }) {
  const primary = section.primary;
  const url = useMemo(() => {
    if (!primary?.storage_key) return '';
    return shelfAssetUrl(bookId, primary.storage_key);
  }, [bookId, primary?.storage_key]);

  if (!primary || !url) return <p className="muted">暂无内容</p>;

  const mime = primary.mime || '';
  const isPdf = mime.includes('pdf') || primary.storage_key.endsWith('.pdf');
  const isDocx =
    mime.includes('wordprocessingml') || primary.storage_key.toLowerCase().endsWith('.docx');

  if (isPdf) {
    return (
      <div className="shelf-lesson-pdf-wrap">
        <iframe title={`${section.title} PDF`} className="shelf-lesson-pdf" src={url} />
      </div>
    );
  }

  if (isDocx) {
    return <ShelfDocxView url={url} title={section.title} />;
  }

  return (
    <p className="shelf-lesson-download">
      <a href={url} target="_blank" rel="noopener noreferrer">
        打开文件
      </a>
    </p>
  );
}

function ShelfDocxView({ url, title }: { url: string; title: string }) {
  const [html, setHtml] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    const run = async () => {
      try {
        const mammoth = await import('mammoth');
        const { sanitizePreviewHtml } = await import('@/lib/sanitize_html');
        const res = await fetch(url);
        if (!res.ok) throw new Error('加载失败');
        const buf = await res.arrayBuffer();
        const out = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (!cancelled) setHtml(sanitizePreviewHtml(out.value || '<p class="muted">（空文档）</p>'));
      } catch {
        if (!cancelled) setErr('无法加载文档');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) return <p className="muted shelf-lesson-docx-loading">加载文档…</p>;
  if (err) return <p className="muted">{err}</p>;

  return (
    <article
      className="shelf-lesson-docx shelf-reader-body"
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ShelfImageTile({
  bookId,
  item,
  onExpand,
}: {
  bookId: string;
  item: ShelfAttachment;
  onExpand: () => void;
}) {
  const src = shelfAssetUrl(bookId, item.storage_key);
  return (
    <button type="button" className="shelf-lesson-image-tile" onClick={onExpand}>
      <img src={src} alt={item.title} loading="lazy" />
      <span>{item.title}</span>
    </button>
  );
}

function ShelfVideoPlayer({ bookId, item }: { bookId: string; item: ShelfAttachment }) {
  const src = shelfAssetUrl(bookId, item.storage_key);
  return (
    <figure className="shelf-lesson-video">
      <video controls playsInline preload="metadata" src={src}>
        您的浏览器不支持视频播放
      </video>
      <figcaption>{item.title}</figcaption>
    </figure>
  );
}
