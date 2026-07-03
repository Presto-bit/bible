import { API_BASE } from './api';

export interface DailyThemesIndex {
  count: number;
  themes: string[];
}

let themesCache: DailyThemesIndex | null = null;

export async function loadDailyThemes(): Promise<DailyThemesIndex> {
  if (themesCache) return themesCache;
  try {
    const res = await fetch(`${API_BASE}/content/themes`, { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { count?: number; themes?: string[] };
      themesCache = {
        count: data.count ?? data.themes?.length ?? 0,
        themes: data.themes ?? [],
      };
      return themesCache;
    }
  } catch {
    /* ignore */
  }
  themesCache = { count: 0, themes: [] };
  return themesCache;
}
