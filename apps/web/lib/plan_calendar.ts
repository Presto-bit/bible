import type { GeneratedPlan } from './api';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODateLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function defaultPlanStartDate(): string {
  return toISODateLocal(new Date());
}

export function defaultPlanEndDate(startISO = defaultPlanStartDate(), offsetDays = 29): string {
  const d = parseISODate(startISO);
  d.setDate(d.getDate() + offsetDays);
  return toISODateLocal(d);
}

/** 起止日期内的读经日（可剔除周六/周日） */
export function buildEligibleDates(
  startISO: string,
  endISO: string,
  excludeSaturday: boolean,
  excludeSunday: boolean,
): string[] {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (end < start) return [];

  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (excludeSunday && dow === 0) {
      cur.setDate(cur.getDate() + 1);
      continue;
    }
    if (excludeSaturday && dow === 6) {
      cur.setDate(cur.getDate() + 1);
      continue;
    }
    out.push(toISODateLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function formatPlanDayDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_CN[d.getDay()]}`;
}

export function attachCalendarToPlan(
  plan: GeneratedPlan,
  eligibleDates: string[],
  opts: {
    startDate: string;
    endDate: string;
    excludeSaturday: boolean;
    excludeSunday: boolean;
  },
): GeneratedPlan {
  const dates = eligibleDates.slice(0, plan.days.length);
  const days = plan.days.map((d, i) => ({
    ...d,
    date: dates[i],
  }));
  return {
    ...plan,
    days,
    days_count: days.length,
    start_date: opts.startDate,
    end_date: opts.endDate,
    exclude_saturday: opts.excludeSaturday,
    exclude_sunday: opts.excludeSunday,
  };
}

export function planDayLabel(day: { day: number; date?: string; title: string }): string {
  if (day.date) return `${formatPlanDayDate(day.date)} · ${day.title}`;
  return day.title;
}
