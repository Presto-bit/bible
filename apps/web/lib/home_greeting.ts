/**
 * 首页问候前缀（仅 Web/PWA）。
 * 优先级：节期/教会年当天 > 欢迎回来(≥3天) > 主日 > 时段。
 */

import { isWelcomeBackGap } from './home_liveness';

/** 与 Mobile 对齐的时段问候（更细分） */
export function timeOfDayGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return '夜深了';
  if (hour < 8) return '清晨好';
  if (hour < 11) return '上午好';
  if (hour < 13) return '中午好';
  if (hour < 17) return '下午好';
  if (hour < 19) return '傍晚好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}

/** 主日按时段 */
export function sundayGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 13) return '主日安好';
  if (hour < 19) return '主日平安';
  return '主日晚安';
}

/** 西方教会历：复活节（格里历算法） */
export function westernEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function ymdKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** 节期 / 教会年当天问候；非节日返回 null */
export function liturgicalGreeting(date = new Date()): string | null {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const day = date.getDate();
  const key = ymdKey(date);

  if (m === 1 && day === 1) return '新年蒙福';
  if (m === 12 && (day === 24 || day === 25)) return '圣诞安好';
  if (m === 9 && day <= 7) return '感恩的日子';

  const easter = westernEasterSunday(y);
  const goodFriday = addDays(easter, -2);
  if (key === ymdKey(goodFriday)) return '纪念十架';
  if (key === ymdKey(easter)) return '复活喜乐';

  return null;
}

/** 首页展示用问候（节期 > 欢迎回来 > 主日 > 时段） */
export function homeGreeting(date = new Date()): string {
  const liturgical = liturgicalGreeting(date);
  if (liturgical) return liturgical;

  if (isWelcomeBackGap(date)) return '欢迎回来';

  if (date.getDay() === 0) return sundayGreeting(date);

  return timeOfDayGreeting(date);
}
