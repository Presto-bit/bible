'use client';

import { useEffect, useState } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
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

/** 会话内消息搜索：结果点击后由父级 focusMsg / ensureVisible 定位。 */
export function ImChatSearch({ open, scope, refId, onClose, onSelect }: Props) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<ImChatSearchHit[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQ('');
      setHits([]);
      setErr(null);
      return;
    }
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
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card im-chat-search-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>搜索聊天记录</strong>
          <SheetCloseButton onClick={onClose} />
        </div>
        <input
          className="search-input"
          autoFocus
          value={q}
          placeholder="搜索本会话消息…"
          onChange={(e) => setQ(e.target.value)}
        />
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
                <span className="im-chat-search-snip">{h.snippet || `[${h.kind}]`}</span>
                {h.created_at ? (
                  <time className="muted">{formatConvListTime(h.created_at)}</time>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
