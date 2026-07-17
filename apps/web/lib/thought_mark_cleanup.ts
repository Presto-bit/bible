/** 删除想法时同步清理同经文划线。 */

import { notifyLocalDataChanged } from './local_data_events';
import { parseMarkRef } from './mark_ref';
import {
  findHighlightStorageRef,
  removeHighlight,
} from './reader_highlights';
import {
  deleteThought,
  getThoughtById,
  myThoughtsForRef,
} from './reader_thoughts';

/** 删除想法后，若该经文已无自己的想法，则同步去掉划线。 */
export function deleteThoughtAndClearMark(id: string): boolean {
  const row = getThoughtById(id);
  if (!deleteThought(id)) return false;
  if (!row?.ref || row.ref === 'FREE') return true;
  if (myThoughtsForRef(row.ref).length > 0) return true;

  removeHighlight(row.ref);

  const parsed = parseMarkRef(row.ref);
  if (parsed?.verseStart != null) {
    const end = parsed.verseEnd ?? parsed.verseStart;
    const verses: number[] = [];
    for (let v = parsed.verseStart; v <= end; v += 1) verses.push(v);
    const storage = findHighlightStorageRef(parsed.bookId, parsed.chapter, verses);
    if (storage && storage !== row.ref) removeHighlight(storage);
  }

  notifyLocalDataChanged('highlights');
  return true;
}
