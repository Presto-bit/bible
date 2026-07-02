'use client';

import React from 'react';
import { stripFollowups } from '@/lib/assistant_format';

// 轻量 Markdown 渲染（无第三方依赖）：支持 ## 标题、**加粗**、- / 1. 列表、
// 【背景】这类小标题、引用经文（> 开头）。用于小爱输出，增强可读性与视觉。

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|“([^”]+)”|「([^」]+)」/g;
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

const LABEL_RE = /^【([^】]+)】\s*(.*)$/;
const FOLLOWUP_HEAD = /^[【\[]?\s*相关追问\s*[】\]]?[:：]?\s*$/;

export default function AnswerText({ text }: { text: string }) {
  if (!text) return null;
  const body = stripFollowups(text);
  const normalized = body
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
            <li key={idx}>{renderInline(it, `oli-${key}-${idx}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={`ul-${key}`} className="ans-list">
          {L.items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `uli-${key}-${idx}`)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
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
    const quote = line.match(/^>\s?(.*)$/);

    if (bullet) {
      if (!list || list.ordered) flushList(key);
      list = list ?? { ordered: false, items: [] };
      list.items.push(bullet[1]);
      return;
    }
    if (numbered) {
      if (!list || !list.ordered) flushList(key);
      list = list ?? { ordered: true, items: [] };
      list.items.push(numbered[1]);
      return;
    }
    flushList(key);

    if (heading) {
      blocks.push(
        <p key={`h-${key}`} className="ans-h">
          {renderInline(heading[1], `h-${key}`)}
        </p>,
      );
    } else if (labelM) {
      blocks.push(
        <div key={`lab-${key}`} className="ans-section">
          <span className="ans-label">{labelM[1]}</span>
          {labelM[2] && <span className="ans-label-rest">{renderInline(labelM[2], `lr-${key}`)}</span>}
        </div>,
      );
    } else if (quote) {
      blocks.push(
        <blockquote key={`bq-${key}`} className="ans-quote-block">
          {renderInline(quote[1], `bq-${key}`)}
        </blockquote>,
      );
    } else {
      blocks.push(
        <p key={`p-${key}`} className="ans-p">
          {renderInline(line, `p-${key}`)}
        </p>,
      );
    }
  });
  flushList('end');

  return <div className="answer-rich">{blocks}</div>;
}
