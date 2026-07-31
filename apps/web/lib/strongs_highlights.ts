/** 从 Strong's 逐词中挑高信息量词，供节级对照半屏「原文要点」。 */

import type { StrongsWord } from './api';

const SKIP_GLOSS = /^(the|a|an|and|or|of|to|in|on|at|by|for|with|from|that|this|is|are|was|were|be|been|he|she|it|they|we|you|i|his|her|their|not|but|as|if)$/i;

/** 常见虚词 / 冠词类 Strong 号（希腊）粗过滤 */
const SKIP_STRONGS = new Set([
  'G3588', // ὁ
  'G2532', // καί
  'G1161', // δέ
  'G1722', // ἐν
  'G1519', // εἰς
  'G1537', // ἐκ
  'G575', // ἀπό
  'G4314', // πρός
  'G235', // ἀλλά
  'G1063', // γάρ
  'G3767', // οὖν
  'G846', // αὐτός often pronoun clutter when alone
  'H853', // eth object marker
  'H413', // el
  'H4480', // min
  'H5921', // al
]);

function morphScore(morphology?: string): number {
  const m = (morphology || '').toUpperCase();
  if (!m) return 1;
  if (/\bV[-:]|VERB/.test(m) || m.startsWith('V-')) return 5;
  if (/\bN[-:]|NOUN/.test(m) || m.startsWith('N-')) return 4;
  if (/\bA[-:]|ADJ/.test(m) || m.startsWith('A-')) return 3;
  if (/\bADV/.test(m)) return 2;
  if (/\bCONJ|\bPREP|\bPRT|\bP-/.test(m)) return 0;
  return 1;
}

function isSkippable(w: StrongsWord): boolean {
  const sid = (w.strongs || '').toUpperCase();
  if (sid && SKIP_STRONGS.has(sid)) return true;
  const gloss = (w.gloss || '').trim();
  if (gloss && SKIP_GLOSS.test(gloss.split(/[,;/]/)[0]!.trim())) return true;
  const word = (w.word || '').trim();
  if (word.length <= 1 && !w.gloss) return true;
  return morphScore(w.morphology) === 0 && !gloss;
}

export type StrongsHighlight = {
  word: string;
  strongs?: string;
  transliteration?: string;
  gloss?: string;
  position: number;
};

/** 选取最多 `limit` 个要点词；无合格词时返回空。 */
export function pickStrongsHighlights(
  words: StrongsWord[],
  limit = 4,
): StrongsHighlight[] {
  const scored = words
    .filter((w) => (w.word || w.lemma) && !isSkippable(w))
    .map((w) => {
      const gloss = (w.gloss || '').trim();
      const score =
        morphScore(w.morphology)
        + (gloss ? 2 : 0)
        + (w.strongs ? 1 : 0)
        + (w.transliteration ? 0.5 : 0);
      return { w, score };
    })
    .sort((a, b) => b.score - a.score || a.w.position - b.w.position);

  const seen = new Set<string>();
  const out: StrongsHighlight[] = [];
  for (const { w } of scored) {
    const key = (w.strongs || w.lemma || w.word || '').toUpperCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push({
      word: (w.word || w.lemma || '').trim(),
      strongs: w.strongs,
      transliteration: w.transliteration,
      gloss: w.gloss,
      position: w.position,
    });
    if (out.length >= limit) break;
  }
  return out;
}
