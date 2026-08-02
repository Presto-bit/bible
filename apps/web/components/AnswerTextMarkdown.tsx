'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { streamingSafeBody } from '@/lib/assistant_format';
import { prepareAssistantMarkdown, parseCitationHref } from '@/lib/assistant_markdown';

type Props = {
  text: string;
  streaming?: boolean;
  dense?: boolean;
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

export default function AnswerText({
  text,
  streaming = false,
  dense = false,
  onCitationClick,
}: Props) {
  const markdown = useMemo(
    () => (streaming ? '' : prepareAssistantMarkdown(text, false)),
    [text, streaming],
  );

  const components = useMemo<Components>(() => ({
    h1: ({ children }) => <h3 className="ans-md-h">{children}</h3>,
    h2: ({ children }) => <h3 className="ans-md-h">{children}</h3>,
    h3: ({ children }) => {
      const plain = childrenToPlain(children);
      const viewpoint = /观点\s*([ABC一二三]|[AaBbCc])/.exec(plain);
      if (viewpoint) {
        const key = viewpoint[1].toUpperCase();
        const isB = key === 'B' || key === '二';
        return (
          <h3
            className={`ans-md-h ans-md-h-viewpoint${isB ? ' ans-md-h-viewpoint-b' : ''}`}
          >
            {children}
          </h3>
        );
      }
      return <h3 className="ans-md-h ans-md-h-section">{children}</h3>;
    },
    h4: ({ children }) => <h4 className="ans-md-h4">{children}</h4>,
    p: ({ children }) => <p className="ans-md-p">{children}</p>,
    ul: ({ children }) => <ul className="ans-md-list">{children}</ul>,
    ol: ({ children }) => <ol className="ans-md-list ans-md-ol">{children}</ol>,
    li: ({ children }) => <li className="ans-md-li">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="ans-md-quote">{children}</blockquote>
    ),
    strong: ({ children }) => <strong className="ans-strong">{children}</strong>,
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

  if (streaming) {
    const safe = streamingSafeBody(text);
    if (!safe.trim()) {
      return (
        <div className="answer-rich answer-rich-md answer-rich-streaming">
          <p className="ans-md-p muted">小爱正在组织回答…</p>
        </div>
      );
    }
    // 流式阶段用纯文本，避免每帧 ReactMarkdown 重解析导致卡顿
    return (
      <div className="answer-rich answer-rich-md answer-rich-streaming">
        <p className="ans-md-p" style={{ whiteSpace: 'pre-wrap' }}>
          {safe}
        </p>
      </div>
    );
  }

  if (!markdown.trim()) {
    return (
      <div className="answer-rich answer-rich-md">
        <p className="ans-md-p muted">…</p>
      </div>
    );
  }

  return (
    <div
      className={`answer-rich answer-rich-md${dense ? ' answer-rich-dense' : ''}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export { FOOTNOTE_RE } from '@/lib/assistant_markdown';
