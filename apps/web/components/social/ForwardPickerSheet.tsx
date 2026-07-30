'use client';

import { useCallback } from 'react';
import { api, contentAssetUrl } from '@/lib/api';
import {
  forwardPreviewLabel,
  ImContactPicker,
  type ImContactTarget,
} from '@/components/social/ImContactPicker';

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

async function sendItemsToTarget(
  target: ImContactTarget,
  items: ForwardPayload[],
  leaveMessage: string,
) {
  let threadId = '';
  if (target.type === 'dm') {
    const dm = await api.openDm(target.peerId);
    threadId = dm.thread_id;
  }

  const uploadCache = new Map<string, Awaited<ReturnType<typeof api.uploadSocialMedia>>>();

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

  if (leaveMessage) {
    if (target.type === 'dm') {
      await api.sendDm(threadId, { kind: 'chat', body: leaveMessage });
    } else {
      await api.sendGroupChat(target.gid, leaveMessage);
    }
  }
}

/** 多选转发：微信式选人；媒体会重新上传。 */
export function ForwardPickerSheet({ open, items, onClose, onDone }: Props) {
  const onConfirm = useCallback(
    async (targets: ImContactTarget[], leaveMessage: string) => {
      for (const t of targets) {
        await sendItemsToTarget(t, items, leaveMessage);
      }
      const label =
        targets.length === 1
          ? targets[0]!.label
          : `${targets[0]!.label} 等 ${targets.length} 个会话`;
      onDone?.(label);
    },
    [items, onDone],
  );

  return (
    <ImContactPicker
      open={open}
      title={`转发${items.length > 1 ? ` ${items.length} 条` : ''}`}
      preview={forwardPreviewLabel(items)}
      confirmLabel="发送"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
