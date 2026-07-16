/** IM 统一消息 DTO（E9）：群聊与私信前端归一 */

export type ImMessageKind =
  | 'chat'
  | 'scripture'
  | 'checkin'
  | 'task'
  | 'system'
  | string;

export interface ImThreadMessage {
  id: string;
  senderId: string;
  kind: ImMessageKind;
  body: string;
  createdAt: string;
  replyToId?: string | null;
  /** 乐观发送 */
  pending?: boolean;
  sendFailed?: boolean;
  retryText?: string;
}

export interface ImThreadPage {
  messages: ImThreadMessage[];
  hasMore: boolean;
}

export function fromGroupMessage(m: {
  id: string;
  author_id?: string;
  sender_id?: string;
  kind: string;
  body: string;
  created_at: string;
  reply_to_id?: string | null;
}): ImThreadMessage {
  return {
    id: m.id,
    senderId: m.author_id || m.sender_id || '',
    kind: m.kind,
    body: m.body,
    createdAt: m.created_at,
    replyToId: m.reply_to_id ?? null,
  };
}

export function fromDmMessage(m: {
  id: string;
  sender_id: string;
  kind: string;
  body: string;
  created_at: string;
  reply_to_id?: string | null;
  pending?: boolean;
  sendFailed?: boolean;
  retryText?: string;
}): ImThreadMessage {
  return {
    id: m.id,
    senderId: m.sender_id,
    kind: m.kind,
    body: m.body,
    createdAt: m.created_at,
    replyToId: m.reply_to_id ?? null,
    pending: m.pending,
    sendFailed: m.sendFailed,
    retryText: m.retryText,
  };
}
