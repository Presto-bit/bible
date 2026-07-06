'use client';

import React from 'react';
import type { Citation } from '@/lib/api';
import {
  bodyText,
  joinOrphanClosers,
  joinOrphanFootnotes,
  renumberOrderedLines,
  softBreakSentences,
  streamingSafeBody,
} from '@/lib/assistant_format';

const LABEL_RE = /^【([^】]+)】\s*(.*)$/;
const FOLLOWUP_HEAD = /^[ \t]*(?:【相关追问】|\[相关追问\]|相关追问\s*[:：])\s*$/;
const CIRCLE_BULLET_RE = /^[ \t]*[①②③④⑤⑥⑦⑧⑨⑩][、.)）]?\s*(.*)$/;
const FOOTNOTE_ONLY_RE =
  /^(\s*(?:\[\d{1,2}\]|［\d{1,2}］|【\d{1,2}】|（\d{1,2}）)\s*)+$/;

function renderInline(
  text: string,
  keyBase: string,
  onCitationClick?: (n: number) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re =
    /\*\*([^*]+)\*\*|“([^”]+)”|「([^」]+)」|［(\d{1,2})］|【(\d{1,2})】|（(\d{1,2})）|\[(\d{1,2})\]/g;
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
    } else {
      const footN = m[4] ?? m[5] ?? m[6] ?? m[7];
      if (footN !== undefined) {
        const n = Number(footN);
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
  const renumbered = renumberOrderedLines(raw);
  const softened = dense ? renumbered : softBreakSentences(renumbered);
  const normalized = joinOrphanFootnotes(
    dense ? softened : joinOrphanClosers(softened),
  );
  const coalescedLines: string[] = [];
  for (const line of normalized.split('\n')) {
    if (FOOTNOTE_ONLY_RE.test(line.trim()) && coalescedLines.length) {
      coalescedLines[coalescedLines.length - 1] += line.trim();
    } else {
      coalescedLines.push(line);
    }
  }
  const lines = coalescedLines;
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
    const numbered = line.match(/^\s*\d+[.、)）]\s*(.*)$/);
    const circle = line.match(CIRCLE_BULLET_RE);
    const quote = line.match(/^>\s?(.*)$/);

    const isStructural = Boolean(heading || labelM || bullet || numbered || circle || quote);
    if (list && list.items.length > 0 && !isStructural && line.trim()) {
      list.items[list.items.length - 1] += `\n${line.trim()}`;
      return;
    }

    if (bullet) {
      if (!list || list.ordered) flushList(key);
      list = list ?? { ordered: false, items: [] };
      list.items.push(bullet[1]);
      return;
    }
    if (numbered || circle) {
      if (!list || !list.ordered) flushList(key);
      list = list ?? { ordered: true, items: [] };
      let item = (numbered ?? circle)![1];
      item = item.replace(/^\d+[.、)）]\s*/, '');
      list.items.push(item);
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
          <p className="ans-section-line">
            <span className="ans-label">{labelM[1]}</span>
            {labelM[2] ? (
              <span className="ans-label-rest">
                {renderInline(labelM[2], `lr-${key}`, onCitationClick)}
              </span>
            ) : null}
          </p>
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

export { FOOTNOTE_ONLY_RE as FOOTNOTE_RE };
