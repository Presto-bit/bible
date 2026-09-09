'use client';

import { Fragment, type ReactNode } from 'react';

type RenderTextFn = (text: string, suffix: string) => ReactNode;

/** 诗体阶梯：第二行起缩进（§7.3）。 */
export function renderPoetryLineBody(
  lines: string[],
  keyBase: string,
  renderText: RenderTextFn,
): ReactNode {
  if (lines.length <= 1) {
    return renderText(lines[0] ?? '', 'body');
  }
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={`${keyBase}-pl-${i}`}>
          {i > 0 ? <br /> : null}
          <span className={i > 0 ? 'reader-poetry-line-indented' : 'reader-poetry-line'}>
            {renderText(line, `pl-${i}`)}
          </span>
        </Fragment>
      ))}
    </>
  );
}
