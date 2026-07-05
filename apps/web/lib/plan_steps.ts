// 计划阅读 Step：最小跳转单元（如「马可 1–2」「约翰 3–6」）。

export interface PlanStep {
  id: string;
  label: string;
  bookId: string;
  chapterStart: number;
  chapterEnd: number;
}

export interface ReadingDayRow {
  day: number;
  book: string;
  book_name?: string;
  bookName?: string;
  chapter_start?: number;
  chapter_end?: number;
  chapterStart?: number;
  chapterEnd?: number;
  title?: string;
}

export interface GeneratedDayRow {
  day: number;
  title: string;
  refs: string[];
  date?: string;
}

function bookLabel(row: ReadingDayRow): string {
  return row.book_name ?? row.bookName ?? row.book;
}

function formatRange(bookName: string, start: number, end: number): string {
  if (start === end) return `${bookName} ${start}`;
  return `${bookName} ${start}–${end}`;
}

export function stepsForReadingRows(rows: ReadingDayRow[], day: number): PlanStep[] {
  return rows
    .filter((r) => r.day === day)
    .map((r) => {
      const cs = r.chapter_start ?? r.chapterStart ?? 1;
      const ce = r.chapter_end ?? r.chapterEnd ?? cs;
      const name = bookLabel(r);
      return {
        id: `${r.book}.${cs}-${ce}`,
        label: r.title?.trim() || formatRange(name, cs, ce),
        bookId: r.book.toUpperCase(),
        chapterStart: cs,
        chapterEnd: ce,
      };
    });
}

function parseRef(ref: string): { book: string; chapter: number } {
  const [book, ch] = ref.split('.');
  return { book: book.toUpperCase(), chapter: Number(ch) || 1 };
}

export function stepsFromRefs(refs: string[], titleHint?: string): PlanStep[] {
  if (!refs.length) return [];
  const parsed = refs.map(parseRef);
  const steps: PlanStep[] = [];
  let start = 0;
  for (let i = 1; i <= parsed.length; i++) {
    const prev = parsed[i - 1];
    const curr = parsed[i];
    const breakGroup =
      !curr || curr.book !== parsed[start].book || curr.chapter !== prev.chapter + 1;
    if (breakGroup) {
      const seg = parsed.slice(start, i);
      const book = seg[0].book;
      const cs = seg[0].chapter;
      const ce = seg[seg.length - 1].chapter;
      steps.push({
        id: `${book}.${cs}-${ce}`,
        label: formatRange(book, cs, ce),
        bookId: book,
        chapterStart: cs,
        chapterEnd: ce,
      });
      start = i;
    }
  }
  if (steps.length === 1 && titleHint) {
    steps[0] = { ...steps[0], label: titleHint };
  }
  return steps;
}

export function stepsForGeneratedDay(day: GeneratedDayRow): PlanStep[] {
  return stepsFromRefs(day.refs, day.title);
}

export function sessionProgress(steps: PlanStep[], stepsDone: string[]) {
  const done = steps.filter((s) => stepsDone.includes(s.id)).length;
  return { done, total: steps.length };
}

export function allStepsDone(steps: PlanStep[], stepsDone: string[]): boolean {
  return steps.length > 0 && steps.every((s) => stepsDone.includes(s.id));
}

export function stepForChapter(
  steps: PlanStep[],
  bookId: string,
  chapter: number,
): number {
  const bid = bookId.toUpperCase();
  return steps.findIndex(
    (s) =>
      s.bookId === bid && chapter >= s.chapterStart && chapter <= s.chapterEnd,
  );
}

export function isLastChapterOfStep(step: PlanStep, chapter: number): boolean {
  return chapter === step.chapterEnd;
}

export function nextIncompleteStep(
  steps: PlanStep[],
  stepsDone: string[],
): PlanStep | null {
  return steps.find((s) => !stepsDone.includes(s.id)) ?? null;
}

/** 当前位置在 Step 末章且仍有下一段未完成。 */
export function pendingNextStep(
  steps: PlanStep[],
  stepsDone: string[],
  bookId: string,
  chapter: number,
): PlanStep | null {
  const bid = bookId.toUpperCase();
  const step = steps.find(
    (s) => s.bookId === bid && chapter >= s.chapterStart && chapter <= s.chapterEnd,
  );
  if (!step || chapter !== step.chapterEnd) return null;
  const next = nextIncompleteStep(steps, stepsDone);
  if (!next || next.id === step.id) return null;
  return next;
}
