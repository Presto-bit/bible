/** 小爱秒回文案与判定（对齐 PRODUCT §v2.9） */

export function isInstantAnswer(meta?: {
  instant?: boolean;
  cache_hit?: boolean;
}): boolean {
  return Boolean(meta?.instant || meta?.cache_hit);
}

export function instantAnswerLabel(opts?: {
  cacheSource?: string;
  local?: boolean;
}): string {
  if (opts?.local) return '本机缓存 · 秒回';
  if (opts?.cacheSource === 'prewarm') return '已预读这节 · 秒回';
  if (opts?.cacheSource === 'cache') return '已缓存 · 秒回';
  return '秒回';
}
