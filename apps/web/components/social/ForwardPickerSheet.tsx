'use client';

import { useCallback, useEffect, useState } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
import { api, contentAssetUrl, type ConversationItem, type Friend } from '@/lib/api';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName } from '@/lib/friend_remarks';

export type ForwardAttachment = {
  url?: string | null;
  file_name?: string | null;
  mime?: string | null;
};

export type ForwardPayload = {
  body?: string | null;
  kind?: string;
  ref?: string | null;
  attachments?: ForwardAttachment[];
};

type Props = {
  open: boolean;
  items: ForwardPayload[];
  onClose: () => void;
  onDone?: (label: string) => void;
};

async function fetchAsFile(att: ForwardAttachment): Promise<File | null> {
  const raw = att.url ? contentAssetUrl(att.url) : '';
  if (!raw) return null;
  try {
    const res = await fetch(raw);
    if (!res.ok) return null;
    const blob = await res.blob();
    const name = att.file_name || 'forward.bin';
    const type = att.mime || blob.type || 'application/octet-stream';
    return new File([blob], name, { type });
  } catch {
    return null;
  }
}

/** 多选转发：选好友私信或群会话；媒体会重新上传。 */
export function ForwardPickerSheet({ open, items, onClose, onDone }: Props) {
  const [tab, setTab] = useState<'dm' | 'group'>('dm');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<ConversationItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([api.friends(), api.conversations()]);
      setFriends(f.friends || []);
      setGroups((c.items || []).filter((x) => x.scope === 'group'));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  if (!open) return null;

  const sendAll = async (
    target:
      | { type: 'dm'; peerId: string; label: string }
      | { type: 'group'; gid: string; label: string },
  ) => {
    setBusy(target.type === 'dm' ? target.peerId : target.gid);
    setErr(null);
    try {
      let threadId = '';
      if (target.type === 'dm') {
        const dm = await api.openDm(target.peerId);
        threadId = dm.thread_id;
      }
      /** 同批转发复用已上传 key，避免同一附件重复上传 */
      const uploadCache = new Map<
        string,
        Awaited<ReturnType<typeof api.uploadSocialMedia>>
      >();

      for (const it of items) {
        const kind = (it.kind || 'chat').toLowerCase();
        const body = (it.body || '').trim();
        const atts = it.attachments?.filter((a) => a.url) || [];

        if (atts.length) {
          for (const a of atts) {
            const cacheKey = `${a.url}|${a.file_name || ''}|${a.mime || ''}`;
            let meta = uploadCache.get(cacheKey);
            if (!meta) {
              const file = await fetchAsFile(a);
              if (!file) throw new Error('附件读取失败，无法转发');
              meta = await api.uploadSocialMedia(file);
              uploadCache.set(cacheKey, meta);
            }
            if (target.type === 'dm') {
              await api.sendDmMedia(threadId, {
                storage_key: meta.storage_key,
                file_name: meta.file_name,
                mime: meta.mime_type,
                size_bytes: meta.size_bytes,
                url: meta.url,
                body: body || undefined,
              });
            } else {
              await api.sendGroupMedia(target.gid, {
                storage_key: meta.storage_key,
                file_name: meta.file_name,
                mime: meta.mime_type,
                size_bytes: meta.size_bytes,
                url: meta.url,
                body: body || undefined,
              });
            }
          }
          continue;
        }

        if (target.type === 'dm') {
          if (kind === 'verse' || it.ref) {
            await api.sendDm(threadId, {
              kind: 'verse',
              ref: it.ref || undefined,
              body: body || it.ref || '经文',
            });
          } else if (body) {
            await api.sendDm(threadId, { kind: 'chat', body });
          }
        } else if (kind === 'verse' || (it.ref && kind !== 'checkin' && kind !== 'task')) {
          if (it.ref) {
            await api.sendGroupVerse(target.gid, {
              ref: it.ref,
              body: body || undefined,
            });
          } else if (body) {
            await api.sendGroupChat(target.gid, body);
          }
        } else if (kind === 'checkin' && it.ref) {
          await api.checkin(target.gid, { ref: it.ref, body: body || undefined });
        } else if (body || it.ref) {
          await api.sendGroupChat(target.gid, body || `[转发] ${it.ref || ''}`.trim());
        }
      }
      onDone?.(target.label);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>转发 {items.length} 条</strong>
          <SheetCloseButton onClick={onClose} />
        </div>
        <div className="reader-tools-tabs" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className={`mode-chip ${tab === 'dm' ? 'mode-chip-active' : ''}`}
            onClick={() => setTab('dm')}
          >
            私信好友
          </button>
          <button
            type="button"
            className={`mode-chip ${tab === 'group' ? 'mode-chip-active' : ''}`}
            onClick={() => setTab('group')}
          >
            共读群
          </button>
        </div>
        {err ? <p className="group-composer-err">{err}</p> : null}
        {busy !== null ? (
          <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            正在转发…若含媒体可能稍慢
          </p>
        ) : null}
        {tab === 'dm' ? (
          friends.length === 0 ? (
            <p className="muted">暂无好友</p>
          ) : (
            <div className="share-target-list">
              {friends.map((f) => {
                const label = friendRemarkOrName(f.user_id, friendDisplayName(f));
                return (
                  <button
                    key={f.user_id}
                    type="button"
                    className="share-target-row"
                    disabled={busy !== null}
                    onClick={() => void sendAll({ type: 'dm', peerId: f.user_id, label })}
                  >
                    <span>{label}</span>
                    <span className="muted">{busy === f.user_id ? '发送中…' : '转发 ›'}</span>
                  </button>
                );
              })}
            </div>
          )
        ) : groups.length === 0 ? (
          <p className="muted">暂无共读群</p>
        ) : (
          <div className="share-target-list">
            {groups.map((g) => (
              <button
                key={g.ref_id}
                type="button"
                className="share-target-row"
                disabled={busy !== null}
                onClick={() => void sendAll({ type: 'group', gid: g.ref_id, label: g.title })}
              >
                <span>{g.title}</span>
                <span className="muted">{busy === g.ref_id ? '发送中…' : '转发 ›'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
