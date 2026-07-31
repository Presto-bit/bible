/** 知识导览本地进度（续看第 N 站） */

export type KnowledgeProgressKind = 'map' | 'timeline' | 'graph' | 'diagram';

export type KnowledgeProgressRow = {
  step: number;
  total: number;
  completed: boolean;
  updatedAt: number;
};

const KEY = 'presto_knowledge_progress_v1';

function progressKey(kind: KnowledgeProgressKind, id: string) {
  return `${kind}:${id}`;
}

function readAll(): Record<string, KnowledgeProgressRow> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, KnowledgeProgressRow>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(m: Record<string, KnowledgeProgressRow>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function getKnowledgeProgress(
  kind: KnowledgeProgressKind,
  id: string,
): KnowledgeProgressRow | null {
  return readAll()[progressKey(kind, id)] ?? null;
}

export function saveKnowledgeProgress(
  kind: KnowledgeProgressKind,
  id: string,
  opts: { step: number; total: number; completed?: boolean },
) {
  const all = readAll();
  const key = progressKey(kind, id);
  all[key] = {
    step: Math.max(0, opts.step),
    total: Math.max(1, opts.total),
    completed: Boolean(opts.completed),
    updatedAt: Date.now(),
  };
  writeAll(all);
}

/** 有未完成进度时返回应续看的 step；已完成或无记录返回 null */
export function resumeKnowledgeStep(
  kind: KnowledgeProgressKind,
  id: string,
): number | null {
  const row = getKnowledgeProgress(kind, id);
  if (!row || row.completed) return null;
  if (row.step <= 0) return null;
  if (row.step >= row.total - 1) return null;
  return row.step;
}

export function knowledgeProgressLabel(row: KnowledgeProgressRow | null, unit = '站'): string {
  if (!row) return '未开始';
  if (row.completed) return '已走完';
  return `已走 ${Math.min(row.step + 1, row.total)}/${row.total} ${unit}`;
}
