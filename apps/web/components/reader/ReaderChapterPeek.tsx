'use client';

import type { Verse } from '@/lib/api';
import { groupVersesIntoParagraphs, isPoetryBook } from '@/lib/paragraphs';
import type { VerseNumberMode } from '@/lib/reader_settings';

type Props = {
  bookId: string;
  bookName: string;
  bookAbbr: (name: string) => string;
  chapter: number;
  verses: Verse[] | null;
  englishUI: boolean;
  fontPx: number;
  fontFamilyCss: string;
  verseNo: VerseNumberMode;
  hideHead?: boolean;
};

export default function ReaderChapterPeek({
  bookId,
  bookName,
  bookAbbr,
  chapter,
  verses,
  englishUI,
  fontPx,
  fontFamilyCss,
  verseNo,
  hideHead = false,
}: Props) {
  if (chapter < 1 || !verses?.length) {
    return (
      <div className="reader-turn-peek-empty muted">
        {chapter < 1 ? (englishUI ? 'Beginning' : '已是首章') : (englishUI ? 'Loading…' : '加载中…')}
      </div>
    );
  }

  const poetry = isPoetryBook(bookId);
  const paragraphs = groupVersesIntoParagraphs(bookId, verses);

  return (
    <div
      className={`reader-turn-peek ${poetry ? 'reader-poetry' : 'reader-prose'}`}
      style={{ fontSize: fontPx, fontFamily: fontFamilyCss }}
    >
      {!hideHead && (
        <div className="reader-chapter-head">
          <span className="reader-head-link">{bookName}</span>
          <span className="reader-head-sep">·</span>
          <span className="reader-head-link reader-head-chapter">
            {englishUI ? `Chapter ${chapter}` : `第 ${chapter} 章`}
          </span>
        </div>
      )}
      {paragraphs.map((para) => (
        <div key={para.startVerse} className="verse-paragraph">
          {para.verses.map((v) => (
            <span key={v.verse} className="verse-inline verse-token">
              {verseNo !== 'hidden' && (
                <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
              )}
              {v.text}{' '}
            </span>
          ))}
        </div>
      ))}
      <p className="reader-turn-peek-hint muted">
        {englishUI ? `${bookAbbr(bookName)} ${chapter}` : `${bookAbbr(bookName)} ${chapter} 章`}
      </p>
    </div>
  );
}
