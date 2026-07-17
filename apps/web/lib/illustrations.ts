/** 主题插画：优先同源 /illustrations（构建时从 data 拷贝），回退 API。 */

import { API_BASE, authHeaders } from './api';

export interface IllustrationItem {
  theme: string;
  motif?: string;
  palette?: string;
  file: string;
}

let indexPromise: Promise<IllustrationItem[]> | null = null;

async function fetchIndex(): Promise<IllustrationItem[]> {
  try {
    const local = await fetch('/illustrations/index.json', { cache: 'force-cache' });
    if (local.ok) {
      const data = (await local.json()) as { items?: IllustrationItem[] };
      if (data.items?.length) return data.items;
    }
  } catch {
    /* fallback API */
  }
  const res = await fetch(`${API_BASE}/content/illustrations`, {
    cache: 'no-store',
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: IllustrationItem[] };
  return data.items ?? [];
}

export function loadIllustrationIndex(): Promise<IllustrationItem[]> {
  if (!indexPromise) indexPromise = fetchIndex();
  return indexPromise;
}

export function invalidateIllustrationIndex() {
  indexPromise = null;
}

/** 同源静态路径（SW 可预缓存） */
export function localIllustrationUrl(file: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return `${base}/illustrations/${encodeURIComponent(file)}`;
}

export function apiIllustrationUrl(file: string): string {
  return `${API_BASE}/content/illustrations/${encodeURIComponent(file)}`;
}

export async function illustrationForTheme(theme?: string | null): Promise<{
  url: string;
  file: string;
} | null> {
  if (!theme) return null;
  const items = await loadIllustrationIndex();
  const item = items.find((i) => i.theme === theme);
  if (!item?.file) return null;
  return { url: localIllustrationUrl(item.file), file: item.file };
}

/** 每日经文主题别名 → 已有插画 */
const THEME_ILLUSTRATION_ALIASES: Record<string, string> = {
  宽恕: '赦免',
  创造: '盼望',
  救恩: '恩典',
  焦虑: '平安',
  苦难: '安慰',
  使命: '引导',
  公义: '智慧',
  圣灵: '敬拜',
  复活: '永生',
  家庭: '爱',
  工作: '力量',
  教会: '敬拜',
};

function pickIllustrationItem(
  items: IllustrationItem[],
  theme?: string | null,
  day?: number | null,
): IllustrationItem | null {
  if (!items.length) return null;
  if (theme) {
    const direct = items.find((i) => i.theme === theme);
    if (direct?.file) return direct;
    const alias = THEME_ILLUSTRATION_ALIASES[theme];
    if (alias) {
      const aliased = items.find((i) => i.theme === alias);
      if (aliased?.file) return aliased;
    }
  }
  const d = Math.max(1, Math.floor(day ?? 1) || 1);
  return items[(d - 1) % items.length] ?? null;
}

/** 每日经文背景：优先主题插画，否则按 day 轮换（保证总有图） */
export async function illustrationForVerseBackground(
  day?: number | null,
  theme?: string | null,
): Promise<{ url: string; file: string } | null> {
  const items = await loadIllustrationIndex();
  const item = pickIllustrationItem(items, theme, day);
  if (!item?.file) return null;
  return { url: localIllustrationUrl(item.file), file: item.file };
}

export const ILLUSTRATION_FILES = [
  'theme_盼望.svg', 'theme_平安.svg', 'theme_信靠.svg', 'theme_力量.svg',
  'theme_爱.svg', 'theme_喜乐.svg', 'theme_智慧.svg', 'theme_引导.svg',
  'theme_安慰.svg', 'theme_赦免.svg', 'theme_感恩.svg', 'theme_敬拜.svg',
  'theme_恩典.svg', 'theme_应许.svg', 'theme_勇气.svg', 'theme_谦卑.svg',
  'theme_祷告.svg', 'theme_忍耐.svg', 'theme_永生.svg', 'theme_顺服.svg',
];
