/** 轻量 RUM：关键路径耗时打点，便于性能回归。 */

type PerfMark = {
  name: string;
  ms: number;
  at: number;
  detail?: Record<string, string | number | boolean | null | undefined>;
};

const MAX = 40;
const buffer: PerfMark[] = [];

export function recordPerf(
  name: string,
  ms: number,
  detail?: PerfMark['detail'],
): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  buffer.push({ name, ms: Math.round(ms), at: Date.now(), detail });
  if (buffer.length > MAX) buffer.shift();
  if (typeof window !== 'undefined' && (window as unknown as { __PRESTO_PERF_DEBUG?: boolean }).__PRESTO_PERF_DEBUG) {
    // eslint-disable-next-line no-console
    console.debug('[perf]', name, `${Math.round(ms)}ms`, detail || '');
  }
}

/** 包装异步操作并记录耗时 */
export async function timedPerf<T>(
  name: string,
  fn: () => Promise<T>,
  detail?: PerfMark['detail'],
): Promise<T> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    return await fn();
  } finally {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    recordPerf(name, t1 - t0, detail);
  }
}

export function peekPerfMarks(): PerfMark[] {
  return buffer.slice();
}
