/** 划线 ↔ 想法绑定（私密想法承接原灵修笔记）。 */

import {
  addThought,
  myThoughtsForRef,
  updateThought,
  type ThoughtVisibility,
} from './reader_thoughts';

export function noteIdForMarkRef(_ref: string): string | null {
  return null;
}

export function bindNoteToMark(_ref: string, _noteId: string) {
  /* legacy no-op */
}

export function unbindMarkRef(_ref: string) {
  /* legacy no-op */
}

export function noteForMarkRef(ref: string): { body: string; id?: string } | null {
  const thought = myThoughtsForRef(ref)[0];
  if (!thought) return null;
  return { body: thought.body, id: thought.id };
}

/** 创建或更新与划线绑定的私密想法。 */
export function upsertMarkNote(ref: string, body: string, visibility: ThoughtVisibility = 'private') {
  const trimmed = body.trim();
  const existing = myThoughtsForRef(ref)[0];
  if (existing) {
    updateThought(existing.id, trimmed, visibility);
    return { ...existing, body: trimmed, visibility };
  }
  return addThought(ref, trimmed, visibility, { skipPublish: true });
}
