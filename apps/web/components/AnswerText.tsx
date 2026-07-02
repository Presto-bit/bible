'use client';

import React from 'react';
import type { Citation } from '@/lib/api';
import { bodyText, streamingSafeBody } from '@/lib/assistant_format';

const LABEL_RE = /^【([^】]+)】\s*(.*)$/;
const FOLLOWUP_HEAD = /^[ \t]*(?:【相关追问】|\[相关追问\]|相关追问\s*[:：])\s*$/;
const CIRCLE_BULLET_RE = /^[ \t]*[①②③④⑤⑥⑦⑧⑨⑩][、.)）]?\s*(.*)$/;
const FOOTNOTE_RE = /\[(\d{1,2})\]/g;

function renderInline(
  text: string,
  keyBase: string,
  onCitationClick?: (n: number) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|“([^”]+)”|「([^」]+)」|\[(\d{1,2})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={`${keyBase}-b${i}`} className="ans-strong">
          {m[1]}
        </strong>,
      );
    } else if (m[4] !== undefined) {
      const n = Number(m[4]);
      nodes.push(
        <button
          key={`${keyBase}-fn${i}`}
          type="button"
          className="ans-footnote"
          onClick={() => onCitationClick?.(n)}
        >
          [{n}]
        </button>,
      );
    } else {
      const quoted = m[2] ?? m[3] ?? '';
      const mark = m[2] !== undefined ? '“”' : '「」';
      nodes.push(
        <span key={`${keyBase}-q${i}`} className="ans-quote">
          {mark[0]}
          {quoted}
          {mark[1]}
        </span>,
      );
    }
    last = re.lastIndex;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Props = {
  text: string;
  streaming?: boolean;
  dense?: boolean;
  citations?: Citation[];
  onCitationClick?: (n: number) => void;
};

export default function AnswerText({
  text,
  streaming = false,
  dense = false,
  onCitationClick,
}: Props) {
  if (!text) return null;
  const raw = streaming ? streamingSafeBody(text) : bodyText(text);
  const normalized = dense
    ? raw
    : raw
        .replace(/([。；！？])(?=[^\n])/g, '$1\n')
        .replace(/([.!?])(?=\s*[^\n])/g, '$1\n');
  const lines = normalized.split('\n');
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!list) return;
    const L = list;
    blocks.push(
      L.ordered ? (
        <ol key={`ol-${key}`} className="ans-list">
          {L.items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `oli-${key}-${idx}`, onCitationClick)}</li>
          ))}
        </ol>
      ) : (
        <ul key={`ul-${key}`} className="ans-list">
          {L.items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `uli-${key}-${idx}`, onCitationClick)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd();
    const key = String(idx);
    if (!line.trim()) {
      flushList(key);
      blocks.push(<div key={`sp-${key}`} className="ans-spacer" aria-hidden />);
      return;
    }
    if (FOLLOWUP_HEAD.test(line.trim())) return;

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const labelM = line.match(LABEL_RE);
    const bullet = line.match(/^\s*[-•·]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.、)]\s+(.*)$/);
    const circle = line.match(CIRCLE_BULLET_RE);
    const quote = line.match(/^>\s?(.*)$/);

    if (bullet) {
      if (!list || list.ordered) flushList(key);
      list = list ?? { ordered: false, items: [] };
      list.items.push(bullet[1]);
      return;
    }
    if (numbered || circle) {
      if (!list || !list.ordered) flushList(key);
      list = list ?? { ordered: true, items: [] };
      list.items.push((numbered ?? circle)![1]);
      return;
    }
    flushList(key);

    if (heading) {
      blocks.push(
        <p key={`h-${key}`} className="ans-h">
          {renderInline(heading[1], `h-${key}`, onCitationClick)}
        </p>,
      );
    } else if (labelM) {
      blocks.push(
        <div key={`lab-${key}`} className="ans-section">
          <span className="ans-label">{labelM[1]}</span>
          {labelM[2] && (
            <span className="ans-label-rest">
              {renderInline(labelM[2], `lr-${key}`, onCitationClick)}
            </span>
          )}
        </div>
      );
    } else if (quote) {
      blocks.push(
        <blockquote key={`bq-${key}`} className="ans-quote-block">
          {renderInline(quote[1], `bq-${key}`, onCitationClick)}
        </blockquote>
      );
    } else {
      blocks.push(
        <p key={`p-${key}`} className="ans-p">
          {renderInline(line, `p-${key}`, onCitationClick)}
        </p>,
      );
    }
  });
  flushList('end');

  if (streaming && blocks.length === 0 && raw) {
    return (
      <div className="answer-rich answer-rich-streaming">
        <p className="ans-p muted">小爱正在组织回答…</p>
      </div>
    );
  }

  return (
    <div className={`answer-rich${streaming ? ' answer-rich-streaming' : ''}`}>
      {blocks}
    </div>
  );
}

export { FOOTNOTE_RE };
