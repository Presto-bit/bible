'use client';

import type { ReactNode } from 'react';
import type { Verse } from '@/lib/api';
import { SectionTitle } from '@/components/reader/SectionTitle';
import type { SectionMark } from '@/lib/section_titles';
import { groupVersesIntoParagraphs, isPoetryBook } from '@/lib/paragraphs';
import type { VerseNumberMode } from '@/lib/reader_settings';
import type { ReadingLayout } from '@/lib/reader_settings';
import {
  highlightClass,
  markForVerse,
  type HighlightMark,
} from '@/lib/reader_highlights';

type MarkInfo = ReturnType<typeof markForVerse>;

type Props = {
  bookId: string;
  chapter: number;
  verses: Verse[] | null;
  /** 分段结构（对照阅读时用中文结构，正文用 verses 译本） */
  structureVerses?: Verse[] | null;
  outline: SectionMark[];
  layout: ReadingLayout;
  parallelVerses?: Verse[] | null;
  englishUI: boolean;
  verseNo: VerseNumberMode;
  verseBlockStyle: React.CSSProperties;
  /** 与正式正文共用同一渲染函数，保证预览/松手后版式一致 */
  renderVerseBody: (
    text: string,
    keyBase: string,
    verseNum: number,
    markInfo?: MarkInfo,
  ) => ReactNode;
  highlightMap: Record<string, HighlightMark>;
  underlinesOn: boolean;
};

/** 跟手翻页邻章预览：版式与正式正文一致（章标题、专名、划线、对照列、段落标题）。 */
export default function ReaderChapterPeek({
  bookId,
  chapter,
  verses,
  structureVerses,
  outline,
  layout,
  parallelVerses,
  englishUI,
  verseNo,
  verseBlockStyle,
  renderVerseBody,
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
  const textByVerse = new Map(verses.map((v) => [v.verse, v.text]));
  const paragraphs = groupVersesIntoParagraphs(
    bookId,
    structure.map((v) => ({ verse: v.verse, text: v.text })),
    outline.map((s) => s.verse),
  );
  const parallel = layout === 'parallel' && parallelVerses?.length ? parallelVerses : null;

  const renderProseParagraph = (para: (typeof paragraphs)[0]) => {
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
                  {renderVerseBody(displayText, `peek-v${v.verse}`, v.verse, markInfo ?? undefined)}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  const renderParallelParagraph = (para: (typeof paragraphs)[0]) => {
    const marks = outline.filter((s) => s.verse >= para.startVerse && s.verse <= para.endVerse);
    const firstMark = marks.find((m) => m.verse === para.startVerse) || marks[0];
    return (
      <div key={para.startVerse} className="reader-parallel-block">
        {firstMark && firstMark.verse === para.startVerse && (
          <SectionTitle title={firstMark.title} onRefClick={() => {}} />
        )}
        <div
          className={`verse-paragraph verse-no-${verseNo}`}
          style={verseBlockStyle}
        >
          {para.verses.map((v) => {
            const displayText = textByVerse.get(v.verse) ?? v.text;
            const markInfo = underlinesOn
              ? markForVerse(highlightMap, bookId, chapter, v.verse)
              : null;
            const wholeMark = markInfo && !markInfo.span ? markInfo.mark : null;
            const p2 = parallel!.find((x) => x.verse === v.verse);
            return (
              <div key={v.verse} className="reader-parallel-verse">
                <div className="reader-parallel-primary">
                  <span
                    className={`verse-inline verse-token ${highlightClass(wholeMark)}`}
                  >
                    {verseNo !== 'hidden' && (
                      <sup className={`verse-sup ${verseNo === 'margin' ? 'verse-sup-margin' : ''}`}>{v.verse}</sup>
                    )}
                    <span className="verse-text-body">
                      {renderVerseBody(displayText, `peek-p${v.verse}`, v.verse, markInfo ?? undefined)}
                    </span>
                  </span>
                </div>
                <div className="reader-parallel-secondary">
                  <span className="verse-inline">{p2?.text ?? '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={`reader-turn-peek ${poetry ? 'reader-poetry' : 'reader-prose'}`}>
      {parallel ? (
        <div className="reader-parallel">
          {paragraphs.map(renderParallelParagraph)}
        </div>
      ) : (
        paragraphs.map(renderProseParagraph)
      )}
    </div>
  );
}
