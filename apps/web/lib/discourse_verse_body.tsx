'use client';

import { Fragment, type ReactNode } from 'react';
import { isSemicolonBreakVerse, splitSemicolonListLines } from './discourse_ranges';

type RenderTextFn = (text: string, suffix: string) => ReactNode;

/** 家谱等：分号换行；其余走默认 renderText。 */
export function renderDiscourseAwareBody(
  text: string,
  keyBase: string,
  bookId: string,
  chapter: number,
  verse: number,
  renderText: RenderTextFn,
): ReactNode {
  if (!isSemicolonBreakVerse(bookId, chapter, verse)) {
    return renderText(text, 'body');
  }
  const lines = splitSemicolonListLines(text);
  if (lines.length <= 1) {
    return renderText(text, 'body');
  }
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={`${keyBase}-list-${i}`}>
          {i > 0 ? <br /> : null}
          <span className={i > 0 ? 'reader-list-line' : undefined}>
            {renderText(line, `list-${i}`)}
          </span>
        </Fragment>
      ))}
    </>
  );
}
