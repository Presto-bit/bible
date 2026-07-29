/** 与 API PRIMARY_VERSION / VERSIONS 对齐的客户端缺省主译本（和合本）。 */
export const FALLBACK_PRIMARY_VERSION = 'cuvs';

/** 缺省中文对照译本（主栏为和合本时）。 */
export const FALLBACK_PARALLEL_VERSION = 'cnv';

/** 译本 id → 展示名（API 未就绪时用，避免顶栏闪出 cuvs/CUVS）。 */
export const VERSION_LABELS: Record<string, string> = {
  cuvs: '和合本',
  cnv: '新译本',
  contemporary: '当代译本',
  kjv: 'King James Version',
};

export function versionDisplayLabel(
  versionId: string | null | undefined,
  versions?: Array<{ id: string; label: string }> | null,
): string {
  const id = (versionId || '').trim();
  if (!id) return VERSION_LABELS[FALLBACK_PRIMARY_VERSION] || '和合本';
  const fromApi = versions?.find((v) => v.id === id)?.label?.trim();
  if (fromApi) return fromApi;
  return VERSION_LABELS[id] || id;
}

export function resolveChapterVersion(mainVersionId?: string | null): string {
  const v = (mainVersionId || '').trim();
  return v || FALLBACK_PRIMARY_VERSION;
}
