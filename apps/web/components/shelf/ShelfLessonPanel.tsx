'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { shelfAssetUrl, type ShelfAttachment, type ShelfSection } from '@/lib/shelf_api';
import { adaptShelfDocxHtml, SHELF_DOCX_STYLE_MAP, shelfSectionHtmlLooksLegacy } from '@/lib/shelf_reading';
import ShelfPaginatedProse from '@/components/shelf/ShelfPaginatedProse';
import ShelfLessonMediaDock from '@/components/shelf/ShelfLessonMediaDock';
import ShelfMediaSheet from '@/components/shelf/ShelfMediaSheet';

const ShelfPdfPager = dynamic(() => import('@/components/shelf/ShelfPdfPager'), {
  ssr: false,
  loading: () => <p className="muted shelf-pdf-status">正在加载 PDF…</p>,
});

import { shelfSectionAttachments } from '@/lib/shelf_lesson_media';

type Props = {
  bookId: string;
  section: ShelfSection;
  childrenLesson?: boolean;
  pageIndex: number;
  scrollOffset?: number;
  scrollAnchor?: { paragraphIndex: number };
  scrollToEnd?: boolean;
  contentKey: string;
  onPageCount?: (count: number) => void;
  onPageIndexChange?: (index: number) => void;
  onScrollProgress?: (ratio: number) => void;
  onScrollAnchor?: (anchor: { paragraphIndex: number }) => void;
  onTap?: () => void;
  chromeHidden?: boolean;
  onPdfPinchActive?: (active: boolean) => void;
  onTextSelectionChange?: (active: boolean) => void;
  onOpenMedia?: () => void;
  onOpenVideo?: (item: ShelfAttachment) => void;
};

export default function ShelfLessonPanel({
  bookId,
  section,
  childrenLesson = false,
  pageIndex,
  scrollOffset = 0,
  scrollAnchor,
  scrollToEnd = false,
  contentKey,
  onPageCount,
  onPageIndexChange,
  onScrollProgress,
  onScrollAnchor,
  onTap,
  chromeHidden = false,
  onPdfPinchActive,
  onTextSelectionChange,
  onOpenMedia,
  onOpenVideo,
}: Props) {
  const [mediaOpenInternal, setMediaOpenInternal] = useState(false);
  const [videoPreview, setVideoPreview] = useState<ShelfAttachment | null>(null);

  const { images, videos, audios } = shelfSectionAttachments(section);
  const hasMedia = images.length > 0 || videos.length > 0 || audios.length > 0;
  const mediaControlled = Boolean(onOpenMedia);
  const openMedia = onOpenMedia ?? (() => setMediaOpenInternal(true));

  const handleOpenVideo = (item: ShelfAttachment) => {
    if (onOpenVideo) {
      onOpenVideo(item);
      return;
    }
    setVideoPreview(item);
  };

  return (
    <div className="shelf-lesson-viewport">
      {hasMedia && !chromeHidden ? (
        <ShelfLessonMediaDock
          videos={videos}
          images={images}
          audios={audios}
          onOpenAll={openMedia}
          onOpenVideo={handleOpenVideo}
        />
      ) : null}

      <ShelfPrimaryView
        bookId={bookId}
        section={section}
        childrenLesson={childrenLesson}
        pageIndex={pageIndex}
        scrollOffset={scrollOffset}
        scrollAnchor={scrollAnchor}
        scrollToEnd={scrollToEnd}
        contentKey={contentKey}
        onPageCount={onPageCount}
        onPageIndexChange={onPageIndexChange}
        onScrollProgress={onScrollProgress}
        onScrollAnchor={onScrollAnchor}
        onTap={onTap}
        chromeHidden={chromeHidden}
        onPdfPinchActive={onPdfPinchActive}
        onTextSelectionChange={onTextSelectionChange}
      />

      {!mediaControlled ? (
        <ShelfMediaSheet
          open={mediaOpenInternal}
          bookId={bookId}
          images={images}
          videos={videos}
          audios={audios}
          onClose={() => setMediaOpenInternal(false)}
          initialVideo={videoPreview}
          onVideoConsumed={() => setVideoPreview(null)}
        />
      ) : null}
    </div>
  );
}

function ShelfPrimaryView({
  bookId,
  section,
  childrenLesson = false,
  pageIndex,
  scrollOffset,
  scrollAnchor,
  scrollToEnd,
  contentKey,
  onPageCount,
  onPageIndexChange,
  onScrollProgress,
  onScrollAnchor,
  onTap,
  chromeHidden,
  onPdfPinchActive,
  onTextSelectionChange,
}: {
  bookId: string;
  section: ShelfSection;
  childrenLesson?: boolean;
  pageIndex: number;
  scrollOffset?: number;
  scrollAnchor?: { paragraphIndex: number };
  scrollToEnd?: boolean;
  contentKey: string;
  onPageCount?: (count: number) => void;
  onPageIndexChange?: (index: number) => void;
  onScrollProgress?: (ratio: number) => void;
  onScrollAnchor?: (anchor: { paragraphIndex: number }) => void;
  onTap?: () => void;
  chromeHidden?: boolean;
  onPdfPinchActive?: (active: boolean) => void;
  onTextSelectionChange?: (active: boolean) => void;
}) {
  const primary = section.primary;
  const url = useMemo(() => {
    if (!primary?.storage_key) return '';
    return shelfAssetUrl(bookId, primary.storage_key);
  }, [bookId, primary?.storage_key]);

  if (section.html?.trim() && !shelfSectionHtmlLooksLegacy(section)) {
    return (
      <ShelfPaginatedProse
        html={section.html}
        bookId={bookId}
        sectionId={section.id}
        pageIndex={0}
        contentKey={contentKey}
        scrollOffset={scrollOffset}
        scrollAnchor={scrollAnchor}
        scrollToEnd={scrollToEnd}
        variant="docx"
        proseTone={childrenLesson ? 'lesson' : 'default'}
        onScrollProgress={onScrollProgress}
        onScrollAnchor={onScrollAnchor}
        onTap={onTap}
        chromeHidden={chromeHidden}
        onTextSelectionChange={onTextSelectionChange}
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
        onTap={onTap}
        onPinchActive={onPdfPinchActive}
      />
    );
  }

  if (isDocx) {
    return (
      <ShelfDocxPaginated
        url={url}
        title={section.title}
        contentKey={contentKey}
        bookId={bookId}
        sectionId={section.id}
        childrenLesson={childrenLesson}
        scrollOffset={scrollOffset}
        scrollAnchor={scrollAnchor}
        scrollToEnd={scrollToEnd}
        onScrollProgress={onScrollProgress}
        onScrollAnchor={onScrollAnchor}
        onTap={onTap}
        chromeHidden={chromeHidden}
        onTextSelectionChange={onTextSelectionChange}
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
  bookId,
  sectionId,
  childrenLesson = false,
  scrollOffset = 0,
  scrollAnchor,
  scrollToEnd = false,
  onScrollProgress,
  onScrollAnchor,
  onTap,
  chromeHidden = false,
  onTextSelectionChange,
}: {
  url: string;
  title: string;
  contentKey: string;
  bookId: string;
  sectionId: string;
  childrenLesson?: boolean;
  scrollOffset?: number;
  scrollAnchor?: { paragraphIndex: number };
  scrollToEnd?: boolean;
  onScrollProgress?: (ratio: number) => void;
  onScrollAnchor?: (anchor: { paragraphIndex: number }) => void;
  onTap?: () => void;
  chromeHidden?: boolean;
  onTextSelectionChange?: (active: boolean) => void;
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
        if (!cancelled) {
          setHtml(
            adaptShelfDocxHtml(out.value || '<p class="muted">（空文档）</p>', {
              lesson: childrenLesson,
            }),
          );
        }
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
  }, [url, childrenLesson]);

  if (loading) return <p className="muted shelf-lesson-docx-loading">正在排版文档…</p>;
  if (err) return <p className="muted">{err}</p>;

  return (
    <ShelfPaginatedProse
      html={html}
      bookId={bookId}
      sectionId={sectionId}
      pageIndex={0}
      contentKey={`${contentKey}:${title}`}
      scrollOffset={scrollOffset}
      scrollAnchor={scrollAnchor}
      scrollToEnd={scrollToEnd}
      variant="docx"
      proseTone={childrenLesson ? 'lesson' : 'default'}
      onScrollProgress={onScrollProgress}
      onScrollAnchor={onScrollAnchor}
      onTap={onTap}
      chromeHidden={chromeHidden}
      onTextSelectionChange={onTextSelectionChange}
    />
  );
}

export function shelfLessonHasPrimary(section: ShelfSection): boolean {
  return Boolean(section.primary?.storage_key || section.html);
}

export { shelfLessonMedia } from '@/lib/shelf_lesson_media';
