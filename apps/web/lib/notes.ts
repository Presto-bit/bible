// H5 笔记本地持久化（localStorage，本地优先）。
// 数据形态与 App（drift `notes` 表）对齐：id / ref / body / tags / version / updatedAt。
// 写操作同时登记到 sync outbox，登录后由 syncNow() 推送到后端 /sync。

import { markLocalDataCreated } from './account_guide';
import { enqueue, noteEnvelope } from './sync';

export interface LocalNote {
  id: string;
  ref?: string | null;
  body: string;
  tags: string[];
  version: number;
  deleted?: boolean;
  updatedAt: number;
}

const KEY = 'presto_notes';

function read(): LocalNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as LocalNote[];
    return Array.isArray(raw)
      ? raw.map((n) => ({ ...n, version: n.version ?? 1 }))
      : [];
  } catch {
    return [];
  }
}

function write(notes: LocalNote[]) {
  localStorage.setItem(KEY, JSON.stringify(notes));
}

// 供 sync.ts 在 pull 时把服务端变更合并回本地（行级 LWW）。
export function applyRemoteNote(env: {
  id: string;
  op: string;
  version?: number | null;
  updated_at?: string | null;
  data?: { ref?: string | null; body?: string; tags?: string[] } | null;
}) {
  const notes = read();
  const idx = notes.findIndex((n) => n.id === env.id);
  const incomingVer = env.version ?? 1;
  if (idx >= 0 && notes[idx].version > incomingVer) return; // 本地更新，跳过
  const ms = env.updated_at ? Date.parse(env.updated_at) : Date.now();
  const merged: LocalNote = {
    id: env.id,
    ref: env.data?.ref ?? notes[idx]?.ref ?? null,
    body: env.data?.body ?? notes[idx]?.body ?? '',
    tags: env.data?.tags ?? notes[idx]?.tags ?? [],
    version: incomingVer,
    deleted: env.op === 'delete',
    updatedAt: ms,
  };
  if (idx >= 0) notes[idx] = merged;
  else notes.push(merged);
  write(notes);
}

export function listNotes(): LocalNote[] {
  return read()
    .filter((n) => !n.deleted)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createNote(body: string, ref?: string | null, tags: string[] = []): LocalNote {
  const note: LocalNote = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ref: ref ?? null,
    body: body.trim(),
    tags,
    version: 1,
    deleted: false,
    updatedAt: Date.now(),
  };
  write([note, ...read()]);
  enqueue(noteEnvelope(note, false));
  markLocalDataCreated();
  return note;
}

export function updateNote(id: string, body: string) {
  let updated: LocalNote | null = null;
  const notes = read().map((n) => {
    if (n.id !== id) return n;
    updated = {
      ...n,
      body: body.trim(),
      version: (n.version ?? 1) + 1,
      updatedAt: Date.now(),
    };
    return updated;
  });
  write(notes);
  if (updated) enqueue(noteEnvelope(updated, false));
}

export function removeNote(id: string) {
  let tomb: LocalNote | null = null;
  const notes = read().map((n) => {
    if (n.id !== id) return n;
    tomb = {
      ...n,
      deleted: true,
      version: (n.version ?? 1) + 1,
      updatedAt: Date.now(),
    };
    return tomb;
  });
  write(notes);
  if (tomb) enqueue(noteEnvelope(tomb, true));
}
