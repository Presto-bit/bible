'use client';

import type { Verse } from '@/lib/api';
import { SectionTitle } from '@/components/reader/SectionTitle';
import type { SectionMark } from '@/lib/section_titles';
import { groupVersesIntoParagraphs, isPoetryBook } from '@/lib/paragraphs';
import type { VerseNumberMode } from '@/lib/reader_settings';

type Props = {
  bookId: string;
  chapter: number;
  verses: Verse[] | null;
  outline: SectionMark[];
  englishUI: boolean;
  verseNo: VerseNumberMode;
  verseBlockStyle: React.CSSProperties;
};

/** 跟手翻页邻章预览：版式与正式正文一致（含段落标题），无划词/笔记等交互。 */
export default function ReaderChapterPeek({
  bookId,
  chapter,
  verses,
  outline,
  englishUI,
  verseNo,
  verseBlockStyle,
}: Props) {
  if (chapter < 1 || !verses?.length) {
    return (
      <div className="reader-turn-peek-empty muted">
        {chapter < 1 ? (englishUI ? 'Beginning' : '已是首章') : (englishUI ? 'Loading…' : '加载中…')}
      </div>
    );
  }

  const poetry = isPoetryBook(bookId);
  const paragraphs = groupVersesIntoParagraphs(
    bookId,
    verses.map((v) => ({ verse: v.verse, text: v.text })),
    outline.map((s) => s.verse),
  );

  return (
    <div className={`reader-turn-peek ${poetry ? 'reader-poetry' : 'reader-prose'}`}>
      {paragraphs.map((para) => {
        const marks = outline.filter((s) => s.verse >= para.startVerse && s.verse <= para.endVerse);
        const firstMark = marks.find((m) => m.verse === para.startVerse) || marks[0];
        return (
          <div key={para.startVerse}>
            {firstMark && firstMark.verse === para.startVerse && (
              <SectionTitle title={firstMark.title} onRefClick={() => {}} />
            )}
            <div className={`verse-paragraph verse-no-${verseNo}`} style={verseBlockStyle}>
              {para.verses.map((v) => (
                <span key={v.verse} className="verse-inline verse-token">
                  {verseNo !== 'hidden' && (
                    <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
                  )}
                  <span className="verse-text-body">{v.text} </span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
