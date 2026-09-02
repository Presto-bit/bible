'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { shelfAssetUrl, type ShelfAttachment, type ShelfSection } from '@/lib/shelf_api';
import { adaptShelfDocxHtml, SHELF_DOCX_STYLE_MAP } from '@/lib/shelf_reading';
import ShelfPaginatedProse from '@/components/shelf/ShelfPaginatedProse';
import ShelfMediaSheet from '@/components/shelf/ShelfMediaSheet';

const ShelfPdfPager = dynamic(() => import('@/components/shelf/ShelfPdfPager'), {
  ssr: false,
  loading: () => <p className="muted shelf-pdf-status">正在加载 PDF…</p>,
});

type Props = {
  bookId: string;
  section: ShelfSection;
  pageIndex: number;
  scrollOffset?: number;
  scrollToEnd?: boolean;
  contentKey: string;
  onPageCount?: (count: number) => void;
  onPageIndexChange?: (index: number) => void;
  onScrollProgress?: (ratio: number) => void;
  onSectionEdge?: (edge: 'prev' | 'next') => void;
  canPrevSection?: boolean;
  canNextSection?: boolean;
  onTap?: () => void;
  pdfFullscreen?: boolean;
  onExitPdfFullscreen?: () => void;
  onOpenPdfFullscreen?: () => void;
};

export default function ShelfLessonPanel({
  bookId,
  section,
  pageIndex,
  scrollOffset = 0,
  scrollToEnd = false,
  contentKey,
  onPageCount,
  onPageIndexChange,
  onScrollProgress,
  onSectionEdge,
  canPrevSection = false,
  canNextSection = false,
  onTap,
  pdfFullscreen = false,
  onExitPdfFullscreen,
  onOpenPdfFullscreen,
}: Props) {
  const [mediaOpen, setMediaOpen] = useState(false);

  const images = section.attachments?.filter((a) => a.kind === 'image') ?? [];
  const videos = section.attachments?.filter((a) => a.kind === 'video') ?? [];
  const hasMedia = images.length > 0 || videos.length > 0;

  return (
    <div className="shelf-lesson-viewport">
      <ShelfPrimaryView
        bookId={bookId}
        section={section}
        pageIndex={pageIndex}
        scrollOffset={scrollOffset}
        scrollToEnd={scrollToEnd}
        contentKey={contentKey}
        onPageCount={onPageCount}
        onPageIndexChange={onPageIndexChange}
        onScrollProgress={onScrollProgress}
        onSectionEdge={onSectionEdge}
        canPrevSection={canPrevSection}
        canNextSection={canNextSection}
        onTap={onTap}
        pdfFullscreen={pdfFullscreen}
        onExitPdfFullscreen={onExitPdfFullscreen}
      />

      {hasMedia && !pdfFullscreen ? (
        <button
          type="button"
          className="shelf-lesson-media-fab"
          aria-label="本课素材"
          onClick={() => setMediaOpen(true)}
        >
          素材
        </button>
      ) : null}

      {!pdfFullscreen && onOpenPdfFullscreen && section.primary?.mime?.includes('pdf') ? (
        <button
          type="button"
          className="shelf-pdf-toolbar-btn shelf-pdf-enter-fullscreen"
          aria-label="全屏阅读 PDF"
          onClick={(e) => {
            e.stopPropagation();
            onOpenPdfFullscreen();
          }}
        >
          ⛶
        </button>
      ) : null}

      <ShelfMediaSheet
        open={mediaOpen}
        bookId={bookId}
        images={images}
        videos={videos}
        onClose={() => setMediaOpen(false)}
      />
    </div>
  );
}

function ShelfPrimaryView({
  bookId,
  section,
  pageIndex,
  scrollOffset,
  scrollToEnd,
  contentKey,
  onPageCount,
  onPageIndexChange,
  onScrollProgress,
  onSectionEdge,
  canPrevSection = false,
  canNextSection = false,
  onTap,
  pdfFullscreen,
  onExitPdfFullscreen,
}: {
  bookId: string;
  section: ShelfSection;
  pageIndex: number;
  scrollOffset?: number;
  scrollToEnd?: boolean;
  contentKey: string;
  onPageCount?: (count: number) => void;
  onPageIndexChange?: (index: number) => void;
  onScrollProgress?: (ratio: number) => void;
  onSectionEdge?: (edge: 'prev' | 'next') => void;
  canPrevSection?: boolean;
  canNextSection?: boolean;
  onTap?: () => void;
  pdfFullscreen?: boolean;
  onExitPdfFullscreen?: () => void;
}) {
  const primary = section.primary;
  const url = useMemo(() => {
    if (!primary?.storage_key) return '';
    return shelfAssetUrl(bookId, primary.storage_key);
  }, [bookId, primary?.storage_key]);

  if (section.html?.trim()) {
    return (
      <ShelfPaginatedProse
        html={section.html}
        contentKey={contentKey}
        scrollOffset={scrollOffset}
        scrollToEnd={scrollToEnd}
        variant="docx"
        onScrollProgress={onScrollProgress}
        onSectionEdge={onSectionEdge}
        canPrevSection={canPrevSection}
        canNextSection={canNextSection}
        onTap={onTap}
      />
    );
  }

  if (!primary || !url) return <p className="muted shelf-lesson-empty">暂无内容</p>;

  const mime = primary.mime || '';
  const isPdf = mime.includes('pdf') || primary.storage_key.endsWith('.pdf');
  const isDocx =
    mime.includes('wordprocessingml') || primary.storage_key.toLowerCase().endsWith('.docx');

  if (isPdf) {
    return (
      <ShelfPdfPager
        url={url}
        title={section.title}
        pageIndex={pageIndex}
        onPageCount={onPageCount}
        onPageIndexChange={onPageIndexChange}
        onSectionEdge={onSectionEdge}
        canPrevSection={canPrevSection}
        canNextSection={canNextSection}
        onTap={onTap}
        fullscreen={pdfFullscreen}
        onExitFullscreen={onExitPdfFullscreen}
      />
    );
  }

  if (isDocx) {
    return (
      <ShelfDocxPaginated
        url={url}
        title={section.title}
        contentKey={contentKey}
        scrollOffset={scrollOffset}
        scrollToEnd={scrollToEnd}
        onScrollProgress={onScrollProgress}
        onSectionEdge={onSectionEdge}
        canPrevSection={canPrevSection}
        canNextSection={canNextSection}
        onTap={onTap}
      />
    );
  }

  return (
    <p className="shelf-lesson-download">
      <a href={url} target="_blank" rel="noopener noreferrer">
        打开文件
      </a>
    </p>
  );
}

function ShelfDocxPaginated({
  url,
  title,
  contentKey,
  scrollOffset = 0,
  scrollToEnd = false,
  onScrollProgress,
  onSectionEdge,
  canPrevSection = false,
  canNextSection = false,
  onTap,
}: {
  url: string;
  title: string;
  contentKey: string;
  scrollOffset?: number;
  scrollToEnd?: boolean;
  onScrollProgress?: (ratio: number) => void;
  onSectionEdge?: (edge: 'prev' | 'next') => void;
  canPrevSection?: boolean;
  canNextSection?: boolean;
  onTap?: () => void;
}) {
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
        const res = await fetch(url);
        if (!res.ok) throw new Error('加载失败');
        const buf = await res.arrayBuffer();
        const out = await mammoth.convertToHtml(
          { arrayBuffer: buf },
          { styleMap: SHELF_DOCX_STYLE_MAP },
        );
        if (!cancelled) setHtml(adaptShelfDocxHtml(out.value || '<p class="muted">（空文档）</p>'));
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

  if (loading) return <p className="muted shelf-lesson-docx-loading">正在排版文档…</p>;
  if (err) return <p className="muted">{err}</p>;

  return (
    <ShelfPaginatedProse
      html={html}
      contentKey={`${contentKey}:${title}`}
      scrollOffset={scrollOffset}
      scrollToEnd={scrollToEnd}
      variant="docx"
      onScrollProgress={onScrollProgress}
      onSectionEdge={onSectionEdge}
      canPrevSection={canPrevSection}
      canNextSection={canNextSection}
      onTap={onTap}
    />
  );
}

export function shelfLessonHasPrimary(section: ShelfSection): boolean {
  return Boolean(section.primary?.storage_key || section.html);
}

export function shelfLessonMedia(section: ShelfSection): {
  images: ShelfAttachment[];
  videos: ShelfAttachment[];
} {
  const images = section.attachments?.filter((a) => a.kind === 'image') ?? [];
  const videos = section.attachments?.filter((a) => a.kind === 'video') ?? [];
  return { images, videos };
}
