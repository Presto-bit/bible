/** 每日经文分享：文字+链 + 经文卡图（二期） */
import { BRAND_NAME } from './brand';
import { shareCard } from './share_card';

export type DailyVerseShareInput = {
  ref: string;
  text: string;
  day?: number;
  versionLabel?: string;
};

export function buildDailyVerseShareText(input: DailyVerseShareInput): string {
  const quote = (input.text || '').trim();
  const ref = (input.ref || '').trim();
  const ver = input.versionLabel?.trim();
  const lines = [
    quote ? `「${quote}」` : '',
    ref ? `—— ${ref}${ver ? ` · ${ver}` : ''}` : '',
    `${BRAND_NAME}每日经文`,
  ].filter(Boolean);
  return lines.join('\n');
}

export function dailyVerseShareUrl(day?: number): string {
  if (typeof window === 'undefined') return '/';
  const u = new URL(window.location.origin);
  u.pathname = '/';
  u.searchParams.set('tab', 'home');
  if (day != null) u.searchParams.set('dv', String(day));
  return u.toString();
}

/** 生成经文卡图并调起系统分享 / 下载；成功返回 true。 */
export async function shareDailyVerseCard(input: DailyVerseShareInput): Promise<boolean> {
  const title = (input.ref || '每日经文').trim();
  const body = (input.text || '').trim();
  if (!body) return false;
  return shareCard({
    title,
    subtitle: input.versionLabel ? `${BRAND_NAME} · ${input.versionLabel}` : `${BRAND_NAME}每日经文`,
    body,
    footer: '安静读经，在话语中相遇',
  });
}
