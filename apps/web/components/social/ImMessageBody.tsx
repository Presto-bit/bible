/** 气泡正文：经文卡 + 链接可点 + @ 高亮。 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { setReaderReturnHref } from '@/lib/reader_return';

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?"')\]])/gi;
const MENTION_RE = /@(所有人|[^\s@]+)/g;

type Props = {
  body?: string | null;
  ref?: string | null;
  kind?: string;
  /** 消息 mentions 字段（含 'all'） */
  mentions?: string[] | null;
  /** 为 false 时不渲染经文卡（父级已渲染） */
  showVerseCard?: boolean;
};

function shouldShowVerse(kind?: string, verseRef?: string | null): boolean {
  if (!verseRef) return false;
  if (!kind) return true;
  return !['system'].includes(kind);
}

export function ImMessageBody({
  body,
  ref: verseRef,
  kind,
  mentions: _mentions,
  showVerseCard = true,
}: Props) {
  const showVerse = showVerseCard && shouldShowVerse(kind, verseRef);
  const href = verseRef ? readerHrefFromRef(verseRef) : null;

  const markReturn = () => {
    if (typeof window !== 'undefined') {
      setReaderReturnHref(`${window.location.pathname}${window.location.search}`);
    }
  };

  const renderText = (text: string) => {
    // 先按 URL 切开，再在非 URL 片段里做 @
    const parts: ReactNode[] = [];
    let last = 0;
    const urlRe = new RegExp(URL_RE.source, 'gi');
    let m: RegExpExecArray | null;
    let i = 0;

    const pushPlain = (chunk: string, keyBase: string) => {
      if (!chunk) return;
      const mentionRe = new RegExp(MENTION_RE.source, 'g');
      let mLast = 0;
      let mm: RegExpExecArray | null;
      let j = 0;
      while ((mm = mentionRe.exec(chunk))) {
        if (mm.index > mLast) parts.push(chunk.slice(mLast, mm.index));
        const token = mm[0];
        const name = mm[1];
        const isAll = name === '所有人';
        parts.push(
          <span
            key={`${keyBase}-m-${j++}`}
            className="im-mention-token"
            data-mention={isAll ? 'all' : name}
          >
            {token}
          </span>,
        );
        mLast = mm.index + token.length;
      }
      if (mLast < chunk.length) parts.push(chunk.slice(mLast));
    };

    while ((m = urlRe.exec(text))) {
      if (m.index > last) pushPlain(text.slice(last, m.index), `t-${i}`);
      const url = m[0];
      parts.push(
        <a key={`u-${i++}`} href={url} target="_blank" rel="noreferrer noopener" className="im-inline-link">
          {url}
        </a>,
      );
      last = m.index + url.length;
    }
    if (last < text.length) pushPlain(text.slice(last), `t-${i}`);
    return parts.length ? parts : text;
  };

  return (
    <div className={`im-msg-body${kind === 'checkin' || kind === 'task' ? ` is-rich-${kind}` : ''}`}>
      {kind === 'checkin' ? (
        <span className="im-rich-kind-chip is-checkin">打卡</span>
      ) : null}
      {kind === 'task' ? (
        <span className="im-rich-kind-chip is-task">任务</span>
      ) : null}
      {showVerse && verseRef ? (
        href ? (
          <Link href={href} className="im-verse-card" onClick={markReturn}>
            <span className="im-verse-card-label">经文</span>
            <strong>{formatGroupRefLabel(verseRef)}</strong>
          </Link>
        ) : (
          <div className="im-verse-card static">
            <span className="im-verse-card-label">经文</span>
            <strong>{formatGroupRefLabel(verseRef)}</strong>
          </div>
        )
      ) : null}
      {body ? <p className="im-msg-text">{renderText(body)}</p> : null}
    </div>
  );
}
