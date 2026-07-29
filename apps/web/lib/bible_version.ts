/** 与 API PRIMARY_VERSION 对齐的客户端缺省主译本（和合本）。 */
export const FALLBACK_PRIMARY_VERSION = 'cuvs';

/** 缺省中文对照译本（主栏为和合本时）。 */
export const FALLBACK_PARALLEL_VERSION = 'cnv';

export function resolveChapterVersion(mainVersionId?: string | null): string {
  const v = (mainVersionId || '').trim();
  return v || FALLBACK_PRIMARY_VERSION;
}
