// 章节情境：时间线、地点、一句话背景（轻量 MVP）。

export interface ChapterContext {
  era?: string;
  place?: string;
  summary?: string;
}

const CONTEXT: Record<string, Record<number, ChapterContext>> = {
  GEN: {
    1: { era: '创造之初', place: '宇宙', summary: '神六日创造天地万物，第七日安息。' },
    3: { era: '伊甸园', place: '东方', summary: '人的堕落与救恩的应许。' },
  },
  EXO: {
    14: { era: '出埃及', place: '红海', summary: '神使海水分开，以色列人走干地。' },
    20: { era: '西奈山', place: '旷野', summary: '神颁布十诫。' },
  },
  PSA: {
    23: { era: '大卫时代', place: '牧野', summary: '耶和华是我的牧者。' },
  },
  ISA: {
    53: { era: '被掳前后', summary: '受苦仆人之歌。' },
  },
  MAT: {
    5: { era: '耶稣事工', place: '加利利', summary: '登山宝训：天国伦理。' },
    28: { era: '复活后', place: '加利利', summary: '大使命与主同在的应许。' },
  },
  JHN: {
    1: { era: '道成肉身', place: '犹太', summary: '太初有道，道成了肉身。' },
    3: { era: '耶稣事工', place: '耶路撒冷', summary: '尼哥底母与重生的对话。' },
  },
  ACT: {
    2: { era: '五旬节', place: '耶路撒冷', summary: '圣灵降临，教会诞生。' },
  },
  ROM: {
    8: { era: '保罗书信', place: '哥林多', summary: '圣灵与神儿女的确据。' },
  },
  REV: {
    21: { era: '末世异象', summary: '新天新地与神与人同住。' },
  },
};

export function chapterContext(bookId: string, chapter: number): ChapterContext | null {
  const book = CONTEXT[bookId.toUpperCase()];
  if (!book) return null;
  return book[chapter] ?? null;
}
