'use client';

import { useRouter } from 'next/navigation';
import {
  loadShelfBookProgress,
  loadShelfLastRead,
  shelfCoverUrl,
  type ShelfBookSummary,
} from '@/lib/shelf_api';
import { shelfBookReadHref } from '@/lib/shelf_library';
import { navigateAppHref } from '@/lib/pwa_tab_nav';
import ShelfBrandCover from '@/components/shelf/ShelfBrandCover';

type Props = {
  items: ShelfBookSummary[];
};

export default function ShelfContinueReadingBar({ items }: Props) {
  const router = useRouter();
  const last = loadShelfLastRead();
  if (!last?.bookId) return null;

  const book = items.find((b) => b.id === last.bookId);
  if (!book) return null;

  const progress = loadShelfBookProgress(book.id);
  if (progress?.finished || (progress?.progressRatio ?? 0) >= 0.97) return null;

  const href = shelfBookReadHref(book.id);
  const coverUrl = shelfCoverUrl(book.id, book.cover_storage_key);
  const sectionLabel = last.sectionTitle?.trim() || '继续上次位置';

  return (
    <button
      type="button"
      className="shelf-continue-bar"
      onClick={() => navigateAppHref(href, router)}
    >
      <div className="shelf-continue-bar-cover">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="shelf-book-card-image" draggable={false} />
        ) : (
          <ShelfBrandCover />
        )}
      </div>
      <div className="shelf-continue-bar-body">
        <p className="shelf-continue-bar-label muted">继续阅读</p>
        <p className="shelf-continue-bar-title">{book.title}</p>
        <p className="shelf-continue-bar-meta muted">{sectionLabel}</p>
      </div>
      <span className="shelf-continue-bar-action" aria-hidden>
        ›
      </span>
    </button>
  );
}
