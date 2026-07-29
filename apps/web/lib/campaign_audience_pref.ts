/** 记住上次活动受众（默认「我的群」多选） */

const STORAGE_KEY = 'ops-campaign-last-audience-v1';

export type LastAudiencePref = {
  audienceMode: 'groups' | 'all' | 'admin_preview';
  groupIds: string[];
  savedAt: string;
};

export function loadLastAudiencePref(): LastAudiencePref | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastAudiencePref>;
    const mode = parsed.audienceMode;
    if (mode !== 'groups' && mode !== 'all' && mode !== 'admin_preview') return null;
    return {
      audienceMode: mode,
      groupIds: Array.isArray(parsed.groupIds)
        ? parsed.groupIds.filter((id): id is string => typeof id === 'string')
        : [],
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  } catch {
    return null;
  }
}

export function saveLastAudiencePref(input: {
  audienceMode: 'groups' | 'all' | 'admin_preview';
  groupIds: string[];
}): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: LastAudiencePref = {
      audienceMode: input.audienceMode,
      groupIds: input.groupIds,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** 在可用群中恢复上次勾选；无记忆则单群默认全选 */
export function resolveDefaultGroupIds(
  availableIds: string[],
  preferredIds?: string[] | null,
): string[] {
  const allowed = new Set(availableIds);
  const preferred = (preferredIds || []).filter((id) => allowed.has(id));
  if (preferred.length) return preferred;
  if (availableIds.length === 1) return [availableIds[0]!];
  return [];
}
