'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
import AppBodyPortal from '@/components/AppBodyPortal';
import { api } from '@/lib/api';
import { formatConvListTime } from '@/lib/im_ui';

export type ImChatSearchHit = {
  message_id: string;
  snippet: string;
  kind: string;
  created_at?: string | null;
};

type Props = {
  open: boolean;
  scope: 'group' | 'dm';
  refId: string;
  onClose: () => void;
  onSelect: (messageId: string) => void;
};

function highlightSnippet(snippet: string, query: string): ReactNode {
  const q = query.trim();
  if (!q || !snippet) return snippet || '';
  const lower = snippet.toLowerCase();
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < snippet.length) {
    const hit = lower.indexOf(needle, i);
    if (hit < 0) {
      parts.push(snippet.slice(i));
      break;
    }
    if (hit > i) parts.push(snippet.slice(i, hit));
    parts.push(
      <mark key={key++} className="im-search-mark">
        {snippet.slice(hit, hit + q.length)}
      </mark>,
    );
    i = hit + q.length;
  }
  return parts;
}

/** 会话内消息搜索：顶栏输入，避免键盘遮挡。 */
export function ImChatSearch({ open, scope, refId, onClose, onSelect }: Props) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<ImChatSearchHit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQ('');
      setHits([]);
      setErr(null);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;

    const apply = () => {
      const layoutH = window.innerHeight || root.clientHeight || 0;
      const vvH = vv?.height ?? layoutH;
      const offsetTop = vv?.offsetTop ?? 0;
      const gap = Math.max(0, Math.round(layoutH - (vvH + offsetTop)));
      const inset = gap > 24 ? gap : 0;
      root.style.setProperty('--im-search-kb', `${inset}px`);
      body.classList.toggle('im-search-keyboard', inset > 0);
    };

    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      root.style.removeProperty('--im-search-kb');
      body.classList.remove('im-search-keyboard');
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 1) {
      setHits([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = window.setTimeout(() => {
      void api
        .searchMessages(query, { scope, refId, limit: 40 })
        .then((r) => {
          setHits(
            (r.items || [])
              .filter((x) => x.kind !== 'conversation' && !String(x.message_id).startsWith('title:'))
              .map((x) => ({
                message_id: x.message_id,
                snippet: x.snippet,
                kind: x.kind,
                created_at: x.created_at,
              })),
          );
          setErr(null);
        })
        .catch((e) => setErr(e instanceof Error ? e.message : '搜索失败'))
        .finally(() => setBusy(false));
    }, 280);
    return () => window.clearTimeout(t);
  }, [open, q, scope, refId]);

  if (!open) return null;

  return (
    <AppBodyPortal>
      <div className="im-chat-search-backdrop" onClick={onClose}>
        <div
          className="im-chat-search-sheet card"
          role="dialog"
          aria-modal="true"
          aria-label="搜索聊天记录"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="im-chat-search-head">
            <strong>搜索聊天记录</strong>
            <SheetCloseButton onClick={onClose} />
          </div>
          <input
            ref={inputRef}
            className="search-input im-chat-search-input"
            value={q}
            placeholder="搜索本会话消息…"
            enterKeyHint="search"
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="im-chat-search-body">
            {err ? <p className="muted" style={{ fontSize: 13 }}>{err}</p> : null}
            {busy ? <p className="muted" style={{ fontSize: 13 }}>搜索中…</p> : null}
            {!busy && q.trim() && hits.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>无匹配消息</p>
            ) : null}
            <ul className="im-chat-search-list">
              {hits.map((h) => (
                <li key={h.message_id}>
                  <button
                    type="button"
                    className="im-chat-search-hit"
                    onClick={() => {
                      onSelect(h.message_id);
                      onClose();
                    }}
                  >
                    <span className="im-chat-search-snip">
                      {highlightSnippet(h.snippet || `[${h.kind}]`, q)}
                    </span>
                    {h.created_at ? (
                      <time className="muted">{formatConvListTime(h.created_at)}</time>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AppBodyPortal>
  );
}
