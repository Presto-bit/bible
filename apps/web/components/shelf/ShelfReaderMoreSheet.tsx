'use client';

import { useRouter } from 'next/navigation';
import AppBodyPortal from '@/components/AppBodyPortal';

export default function ShelfReaderMoreSheet({
  bookId,
  bookTitle,
  sectionTitle,
  sectionId,
  onClose,
  onWriteReview,
}: {
  bookId: string;
  bookTitle: string;
  sectionTitle?: string;
  sectionId?: string | null;
  onClose: () => void;
  onWriteReview: () => void;
}) {
  const router = useRouter();

  const openDetail = (tab?: string) => {
    onClose();
    const q = tab ? `?tab=${tab}` : '';
    router.push(`/shelf/${encodeURIComponent(bookId)}${q}`);
  };

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet card shelf-more-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="half-sheet-grab" aria-hidden />
          <strong className="shelf-more-title">{bookTitle}</strong>
          {sectionTitle ? <p className="muted shelf-more-section">{sectionTitle}</p> : null}
          <div className="shelf-more-actions">
            <button type="button" className="shelf-more-btn" onClick={() => openDetail('notes')}>
              本书笔记
            </button>
            <button type="button" className="shelf-more-btn" onClick={() => openDetail('reviews')}>
              书评与公开笔记
            </button>
            <button type="button" className="shelf-more-btn" onClick={() => { onClose(); onWriteReview(); }}>
              写书评
            </button>
          </div>
        </div>
      </div>
    </AppBodyPortal>
  );
}
