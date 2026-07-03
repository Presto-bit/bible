import { API_BASE } from './api';
import { unsplashPhotoUrl } from './daily_verse_wallpaper';

/** 主题插画 SVG（离线经包同源路径）。 */
const ILLUSTRATION_THEMES = [
  '盼望', '平安', '信靠', '力量', '爱', '喜乐', '智慧', '引导', '安慰', '赦免',
  '感恩', '谦卑', '勇气', '应许', '祷告', '敬拜', '永生', '顺服', '忍耐', '恩典',
] as const;

export type CardCover = {
  photo: string;
  fallback: string;
  alt?: string;
};

const CARD_ILLUSTRATION: Record<string, string> = {
  resume: '恩典',
  plan: '引导',
  prayer: '祷告',
  group: '爱',
  notes: '智慧',
  challenge: '力量',
  suggest: '引导',
  assistant: '安慰',
  plans: '引导',
  discover: '盼望',
  more: '智慧',
};

export function illustrationUrl(theme: string): string {
  const safe = ILLUSTRATION_THEMES.includes(theme as (typeof ILLUSTRATION_THEMES)[number])
    ? theme
    : '恩典';
  const file = `theme_${safe}.svg`;
  return `${API_BASE}/content/illustrations/${encodeURIComponent(file)}`;
}

/** 每日经文 theme 字段 → 插画主题名 */
export function illustrationThemeFromVerse(theme?: string | null): string {
  if (!theme) return '恩典';
  const t = theme.trim();
  if (ILLUSTRATION_THEMES.includes(t as (typeof ILLUSTRATION_THEMES)[number])) return t;
  if (/创世|创造/.test(t)) return '应许';
  if (/诗|赞美/.test(t)) return '敬拜';
  if (/福音|救/.test(t)) return '盼望';
  if (/信|望/.test(t)) return '信靠';
  if (/爱/.test(t)) return '爱';
  if (/平安/.test(t)) return '平安';
  return '恩典';
}

function seedFromResumeHref(href?: string): string {
  if (!href) return 'resume';
  try {
    const u = new URL(href, 'https://local.test');
    const book = u.searchParams.get('book') || '';
    const chapter = u.searchParams.get('chapter') || '';
    if (book) return `read-${book}-${chapter || '1'}`;
  } catch {
    /* ignore */
  }
  return 'resume';
}

export function coverForCardId(
  id: string,
  opts?: { resumeHref?: string; verseTheme?: string | null },
): CardCover {
  const illustration = illustrationUrl(
    id === 'resume' && opts?.verseTheme
      ? illustrationThemeFromVerse(opts.verseTheme)
      : (CARD_ILLUSTRATION[id] ?? '恩典'),
  );

  let photoSeed = id;
  if (id === 'resume') photoSeed = seedFromResumeHref(opts?.resumeHref);
  if (id === 'suggest') photoSeed = 'suggest-reading';

  const tall = id === 'resume';
  const photo = unsplashPhotoUrl(photoSeed, {
    w: tall ? 560 : 480,
    h: tall ? 320 : 260,
    q: 75,
  });

  return {
    photo,
    fallback: illustration,
    alt: '',
  };
}

/** 更多 Sheet 小缩略图 */
export function coverThumbForCardId(id: string): CardCover {
  const base = coverForCardId(id);
  return {
    ...base,
    photo: unsplashPhotoUrl(id, { w: 160, h: 160, q: 70 }),
  };
}
