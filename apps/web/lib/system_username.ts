/** 展示昵称：中性占位 + 系统随机名识别 + 可选灵感（与 API random_username 词表一致）。 */

export const DISPLAY_NAME_PLACEHOLDER = '读经伙伴';

const PREFIXES = [
  '蒙恩',
  '喜乐',
  '平安',
  '盼望',
  '良善',
  '温柔',
  '谦卑',
  '慈爱',
  '信实',
  '忍耐',
  '感恩',
  '仰望',
  '寻道',
  '同行',
  '馨香',
] as const;

const SUFFIXES = [
  '的旅人',
  '的牧人',
  '的门徒',
  '的子民',
  '的羊群',
  '的橄榄枝',
  '的葡萄树',
  '的晨星',
  '的灯台',
  '的活水',
  '的麦田',
  '的飞鸽',
] as const;

const GENERATED_RE = new RegExp(
  `^(${PREFIXES.map(escapeRe).join('|')})(${SUFFIXES.map(escapeRe).join('|')})(\\d{2})?$`,
);

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 是否为系统曾分配的随机名（含撞名时追加的两位数字）。 */
export function isSystemGeneratedUsername(name: string | null | undefined): boolean {
  const n = (name || '').trim();
  return Boolean(n && GENERATED_RE.test(n));
}

/** 尚无自设展示名（空或仍是系统随机名）→ 应软催用户起名 */
export function needsSelfSetDisplayName(name?: string | null): boolean {
  const n = (name || '').trim();
  return !n || isSystemGeneratedUsername(n);
}

export function displayNameHint(name?: string | null): string | null {
  const n = (name || '').trim();
  if (!n) return '点此起个称呼，朋友会更容易认出你';
  if (isSystemGeneratedUsername(n)) return '这是系统起的名字，点此改成你的';
  return null;
}
