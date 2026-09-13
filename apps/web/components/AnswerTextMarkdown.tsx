'use client';

import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { prepareAssistantMarkdown, parseCitationHref } from '@/lib/assistant_markdown';
import { sectionSlug } from '@/lib/assistant_sections';
import type { StreamSection } from '@/lib/assistant_section_stream';

type Props = {
  text: string;
  streaming?: boolean;
  dense?: boolean;
  streamSections?: StreamSection[];
  onCitationClick?: (n: number) => void;
};

function CitationButton({
  n,
  onCitationClick,
}: {
  n: number;
  onCitationClick?: (n: number) => void;
}) {
  return (
    <button
      type="button"
      className="ans-footnote"
      onClick={() => onCitationClick?.(n)}
    >
      [{n}]
    </button>
  );
}

function childrenToPlain(children: React.ReactNode): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenToPlain).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
    return childrenToPlain(children.props.children);
  }
  return '';
}

function useMarkdownComponents(onCitationClick?: (n: number) => void): Components {
  return useMemo<Components>(() => ({
    h1: ({ children }) => <h3 className="ans-md-h">{children}</h3>,
    h2: ({ children }) => <h3 className="ans-md-h">{children}</h3>,
    h3: ({ children }) => {
      const plain = childrenToPlain(children).trim();
      const id = sectionSlug(plain);
      if (plain === '摘要' || plain === '本章概览' || plain === '卷概览') {
        return (
          <h3 id={id} className="ans-md-h ans-md-h-summary">{children}</h3>
        );
      }
      const viewpoint = /观点\s*([ABC一二三]|[AaBbCc])/.exec(plain);
      if (viewpoint) {
        const key = viewpoint[1].toUpperCase();
        const isB = key === 'B' || key === '二';
        return (
          <h3
            id={id}
            className={`ans-md-h ans-md-h-viewpoint${isB ? ' ans-md-h-viewpoint-b' : ''}`}
          >
            {children}
          </h3>
        );
      }
      return <h3 id={id} className="ans-md-h ans-md-h-section">{children}</h3>;
    },
    h4: ({ children }) => <h4 className="ans-md-h4">{children}</h4>,
    p: ({ children }) => <p className="ans-md-p">{children}</p>,
    ul: ({ children }) => <ul className="ans-md-list">{children}</ul>,
    ol: ({ children }) => <ol className="ans-md-list ans-md-ol">{children}</ol>,
    li: ({ children }) => <li className="ans-md-li">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="ans-md-quote">{children}</blockquote>
    ),
    strong: ({ children }) => <strong className="ans-md-strong">{children}</strong>,
    em: ({ children }) => <em className="ans-md-em">{children}</em>,
    hr: () => <hr className="ans-md-hr" />,
    a: ({ href, children }) => {
      const cite = parseCitationHref(href);
      if (cite != null) {
        return <CitationButton n={cite} onCitationClick={onCitationClick} />;
      }
      return (
        <a
          className="ans-md-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    },
    code: ({ className, children }) => {
      const isBlock = Boolean(className);
      if (isBlock) {
        return <code className={`ans-md-code ${className ?? ''}`}>{children}</code>;
      }
      return <code className="ans-md-code-inline">{children}</code>;
    },
    pre: ({ children }) => <pre className="ans-md-pre">{children}</pre>,
    table: ({ children }) => (
      <div className="ans-md-table-wrap">
        <table className="ans-md-table">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="ans-md-thead">{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className="ans-md-tr">{children}</tr>,
    th: ({ children }) => <th className="ans-md-th">{children}</th>,
    td: ({ children }) => <td className="ans-md-td">{children}</td>,
  }), [onCitationClick]);
}

const MarkdownBlock = memo(function MarkdownBlock({
  markdown,
  streaming,
  dense,
  components,
}: {
  markdown: string;
  streaming: boolean;
  dense: boolean;
  components: Components;
}) {
  if (!markdown.trim()) return null;
  return (
    <div
      className={`answer-rich answer-rich-md${dense ? ' answer-rich-dense' : ''}${streaming ? ' answer-rich-streaming' : ''}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
});

const SectionMarkdownBlock = memo(function SectionMarkdownBlock({
  section,
  streaming,
  dense,
  components,
}: {
  section: StreamSection;
  streaming: boolean;
  dense: boolean;
  components: Components;
}) {
  const hasText = section.text.trim().length > 0;
  const chunk = hasText ? `### ${section.title}\n${section.text}`.trimEnd() : '';
  const markdown = useMemo(
    () => prepareAssistantMarkdown(chunk, streaming),
    [chunk, streaming],
  );
  if (!hasText) return null;
  return (
    <MarkdownBlock
      markdown={markdown}
      streaming={streaming}
      dense={dense}
      components={components}
    />
  );
});

export default function AnswerText({
  text,
  streaming = false,
  dense = false,
  streamSections,
  onCitationClick,
}: Props) {
  const components = useMarkdownComponents(onCitationClick);
  const markdown = useMemo(
    () => prepareAssistantMarkdown(text, streaming),
    [text, streaming],
  );

  const sectioned =
    streaming
    && streamSections
    && streamSections.length > 0
    && streamSections.some((s) => s.text.trim());

  if (sectioned) {
    return (
      <div className="answer-rich-sectioned">
        {streamSections!
          .filter((sec) => sec.text.trim())
          .map((sec, index, written) => {
          const isActive = !sec.finalized && index === written.length - 1;
          return (
            <SectionMarkdownBlock
              key={sec.id}
              section={sec}
              streaming={isActive}
              dense={dense}
              components={components}
            />
          );
        })}
      </div>
    );
  }

  if (!markdown.trim()) {
    return null;
  }

  return (
    <MarkdownBlock
      markdown={markdown}
      streaming={streaming}
      dense={dense}
      components={components}
    />
  );
}

export { FOOTNOTE_RE } from '@/lib/assistant_markdown';
