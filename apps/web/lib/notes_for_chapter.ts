import type { LocalNote } from './notes';

function add(map: Map<number, LocalNote[]>, verse: number, note: LocalNote) {
  if (!verse || verse < 1) return;
  const cur = map.get(verse) ?? [];
  if (!cur.some((n) => n.id === note.id)) cur.push(note);
  map.set(verse, cur);
}

/** 将笔记按经节映射到当前章（支持 ref 如 GEN.1.3 或 GEN.1.3-5）。 */
export function notesForChapter(
  notes: LocalNote[],
  bookId: string,
  chapter: number,
): Map<number, LocalNote[]> {
  const map = new Map<number, LocalNote[]>();
  const bid = bookId.toUpperCase();
  for (const note of notes) {
    if (!note.ref || note.deleted) continue;
    const parts = note.ref.split('.');
    if (parts.length < 2) continue;
    if (parts[0].toUpperCase() !== bid) continue;
    if (Number(parts[1]) !== chapter) continue;
    if (!parts[2]) {
      add(map, 1, note);
      continue;
    }
    const vp = parts[2];
    if (vp.includes('-')) {
      const [a, b] = vp.split('-');
      const from = Number(a);
      const to = Number(b) || from;
      for (let v = from; v <= to; v++) add(map, v, note);
    } else {
      add(map, Number(vp), note);
    }
  }
  return map;
}
