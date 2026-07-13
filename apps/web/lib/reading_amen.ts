import { userLsGet, userLsSet, userLsRemove } from './user_storage';
const KEY = 'reading_amen_v1';

type AmenSet = Record<string, true>;

function load(): AmenSet {
  if (typeof window === 'undefined') return {};
  try {
    const raw = userLsGet(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AmenSet | Record<string, number>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: AmenSet = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v) out[k] = true;
    }
    return out;
  } catch {
    return {};
  }
}

function save(map: AmenSet) {
  userLsSet(KEY, JSON.stringify(map));
}

export function activityReadingKey(source: string, id: string): string {
  return `${source}:${id}`;
}

/** 当前用户是否已对这条动态点过「在读」 */
export function hasMarkedReading(activityKey: string): boolean {
  return Boolean(load()[activityKey]);
}

/** 标记「在读」，每人每条动态仅一次；已标记则返回 false */
export function markReading(activityKey: string): boolean {
  const map = load();
  if (map[activityKey]) return false;
  map[activityKey] = true;
  save(map);
  return true;
}
