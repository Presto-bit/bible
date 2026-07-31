/** 故事图册本地进度（系列续看） */

export type StoryAlbumProgress = {
  episodeIndex: number;
  beatIndex: number;
  /** episode.id → 是否看完 */
  episodeDone: Record<string, boolean>;
  seriesDone: boolean;
  updatedAt: number;
};

const KEY = 'presto_story_album_v1';

function readAll(): Record<string, StoryAlbumProgress> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoryAlbumProgress>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(m: Record<string, StoryAlbumProgress>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function getStoryAlbumProgress(seriesId: string): StoryAlbumProgress | null {
  return readAll()[seriesId] ?? null;
}

export function saveStoryAlbumProgress(
  seriesId: string,
  patch: Partial<StoryAlbumProgress> & {
    episodeIndex: number;
    beatIndex: number;
  },
) {
  const all = readAll();
  const prev = all[seriesId];
  all[seriesId] = {
    episodeIndex: Math.max(0, patch.episodeIndex),
    beatIndex: Math.max(0, patch.beatIndex),
    episodeDone: patch.episodeDone ?? prev?.episodeDone ?? {},
    seriesDone: patch.seriesDone ?? prev?.seriesDone ?? false,
    updatedAt: Date.now(),
  };
  writeAll(all);
}

export function markEpisodeDone(seriesId: string, episodeId: string, done = true) {
  const all = readAll();
  const prev = all[seriesId] ?? {
    episodeIndex: 0,
    beatIndex: 0,
    episodeDone: {},
    seriesDone: false,
    updatedAt: Date.now(),
  };
  all[seriesId] = {
    ...prev,
    episodeDone: { ...prev.episodeDone, [episodeId]: done },
    updatedAt: Date.now(),
  };
  writeAll(all);
}

export function markSeriesDone(seriesId: string, done = true) {
  const all = readAll();
  const prev = all[seriesId];
  if (!prev) return;
  all[seriesId] = { ...prev, seriesDone: done, updatedAt: Date.now() };
  writeAll(all);
}

/** 续看入口：未完成则回到断点；全完则回第 0 章封面 */
export function resumeStoryAlbum(
  seriesId: string,
  episodeCount: number,
): { episodeIndex: number; beatIndex: number } {
  const row = getStoryAlbumProgress(seriesId);
  if (!row || row.seriesDone) return { episodeIndex: 0, beatIndex: 0 };
  const ep = Math.min(Math.max(0, row.episodeIndex), Math.max(0, episodeCount - 1));
  return { episodeIndex: ep, beatIndex: Math.max(0, row.beatIndex) };
}
