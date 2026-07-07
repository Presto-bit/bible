'use client';

import type { ReactNode } from 'react';
import type { Verse } from '@/lib/api';
import { SectionTitle } from '@/components/reader/SectionTitle';
import type { SectionMark } from '@/lib/section_titles';
import { groupVersesIntoParagraphs, isPoetryBook } from '@/lib/paragraphs';
import type { VerseNumberMode } from '@/lib/reader_settings';
import {
  highlightClass,
  markForVerse,
  type HighlightMark,
} from '@/lib/reader_highlights';

type Props = {
  bookId: string;
  chapter: number;
  verses: Verse[] | null;
  /** 分段结构（对照阅读时用中文结构，正文用 verses 译本） */
  structureVerses?: Verse[] | null;
  outline: SectionMark[];
  englishUI: boolean;
  verseNo: VerseNumberMode;
  verseBlockStyle: React.CSSProperties;
  renderVerseText: (text: string, keyBase: string, verse: number) => ReactNode;
  highlightMap: Record<string, HighlightMark>;
  underlinesOn: boolean;
};

function renderPeekVerseBody(
  text: string,
  keyBase: string,
  verseNum: number,
  renderVerseText: Props['renderVerseText'],
  markInfo?: ReturnType<typeof markForVerse>,
) {
  const span = markInfo?.span;
  const mark = markInfo?.mark ?? null;
  const renderText = (t: string, suffix: string) =>
    renderVerseText(t, `${keyBase}-${suffix}`, verseNum);

  if (span && mark && span.end > span.start && span.start >= 0 && span.end <= text.length) {
    const before = text.slice(0, span.start);
    const mid = text.slice(span.start, span.end);
    const after = text.slice(span.end);
    return (
      <>
        {before ? renderText(before, 'pre') : null}
        <span className={`verse-mark-span ${highlightClass(mark)}`}>
          {renderText(mid, 'mid')}
        </span>
        {after ? renderText(after, 'post') : null}
      </>
    );
  }

  return renderText(text, 'body');
}

/** 跟手翻页邻章预览：版式与正式正文一致（专名、划线、段落标题），无划词/笔记等交互。 */
export default function ReaderChapterPeek({
  bookId,
  chapter,
  verses,
  structureVerses,
  outline,
  englishUI,
  verseNo,
  verseBlockStyle,
  renderVerseText,
  highlightMap,
  underlinesOn,
}: Props) {
  if (chapter < 1 || !verses?.length) {
    return (
      <div className="reader-turn-peek-empty muted">
        {chapter < 1 ? (englishUI ? 'Beginning' : '已是首章') : (englishUI ? 'Loading…' : '加载中…')}
      </div>
    );
  }

  const poetry = isPoetryBook(bookId);
  const structure = structureVerses?.length ? structureVerses : verses;
  const textByVerse = new Map(verses?.map((v) => [v.verse, v.text]) ?? []);
  const paragraphs = groupVersesIntoParagraphs(
    bookId,
    structure!.map((v) => ({ verse: v.verse, text: v.text })),
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
              {para.verses.map((v) => {
                const displayText = textByVerse.get(v.verse) ?? v.text;
                const markInfo = underlinesOn
                  ? markForVerse(highlightMap, bookId, chapter, v.verse)
                  : null;
                const wholeMark = markInfo && !markInfo.span ? markInfo.mark : null;
                return (
                  <span
                    key={v.verse}
                    className={`verse-inline verse-token ${highlightClass(wholeMark)}`}
                  >
                    {verseNo !== 'hidden' && (
                      <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
                    )}
                    <span className="verse-text-body">
                      {renderPeekVerseBody(
                        displayText,
                        `peek-v${v.verse}`,
                        v.verse,
                        renderVerseText,
                        markInfo ?? undefined,
                      )}
                    </span>
                    {' '}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
