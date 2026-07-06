const KEY = 'reading_amen_v1';

type AmenMap = Record<string, number>;

function load(): AmenMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AmenMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function save(map: AmenMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function bumpReadingAmen(ref: string): number {
  const map = load();
  const next = (map[ref] ?? 0) + 1;
  map[ref] = next;
  save(map);
  return next;
}

export function getReadingAmen(ref: string): number {
  return load()[ref] ?? 0;
}
