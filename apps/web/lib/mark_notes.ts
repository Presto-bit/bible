/** 划线 ↔ 灵修笔记绑定（本地索引；笔记正文走 notes sync）。 */

import { createNote, listNotes, updateNote, type LocalNote } from './notes';

const LINK_KEY = 'mark_note_links_v1';

function readLinks(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LINK_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeLinks(map: Record<string, string>) {
  localStorage.setItem(LINK_KEY, JSON.stringify(map));
}

export function noteIdForMarkRef(ref: string): string | null {
  return readLinks()[ref] ?? null;
}

export function bindNoteToMark(ref: string, noteId: string) {
  const map = readLinks();
  map[ref] = noteId;
  writeLinks(map);
}

export function unbindMarkRef(ref: string) {
  const map = readLinks();
  delete map[ref];
  writeLinks(map);
}

export function noteForMarkRef(ref: string): LocalNote | null {
  const id = noteIdForMarkRef(ref);
  if (!id) {
    const byRef = listNotes().find((n) => n.ref === ref);
    return byRef ?? null;
  }
  return listNotes().find((n) => n.id === id) ?? null;
}

/** 创建或更新与划线绑定的笔记。 */
export function upsertMarkNote(ref: string, body: string): LocalNote {
  const trimmed = body.trim();
  const existing = noteForMarkRef(ref);
  if (existing) {
    updateNote(existing.id, trimmed);
    bindNoteToMark(ref, existing.id);
    return { ...existing, body: trimmed, updatedAt: Date.now() };
  }
  const note = createNote(trimmed, ref, ['灵修']);
  bindNoteToMark(ref, note.id);
  return note;
}
