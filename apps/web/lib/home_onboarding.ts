/**
 * 首页 Onboarding 状态机 S0–S3（U12 / PRODUCT §5.1）
 * S0 经包未就绪（且离线）→ S1 未选计划 → S2 首日未完成 → S3 常规
 * 用户关闭横幅后永久不再显示。
 */

import { isAutoBiblePackReady, isOfflinePackReady } from './offline_pack';
import {
  getActivePlan,
  getCompletedPlanDays,
  getPlanDay,
} from './plan_progress';

export type HomeOnboardingStage = 'S0' | 'S1' | 'S2' | 'S3';

export interface HomeOnboardingState {
  stage: HomeOnboardingStage;
  /** 经包是否可用（含和合本自动包 / 联网可先读） */
  packReady: boolean;
  planId: string | null;
  planTitle: string | null;
  planDay: number;
  day1Done: boolean;
}

export type HomeOnboardingCta = {
  title: string;
  body: string;
  href: string;
  label: string;
  /** 次要入口（如自由读 / 下载经包） */
  secondaryHref?: string;
  secondaryLabel?: string;
};

const DISMISS_KEY = 'presto_home_onboarding_dismissed';
export const HOME_ONBOARDING_DISMISS_EVENT = 'presto-home-onboarding-dismissed';

export function isHomeOnboardingDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DISMISS_KEY) === '1';
}

export function dismissHomeOnboarding(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DISMISS_KEY, '1');
  window.dispatchEvent(new Event(HOME_ONBOARDING_DISMISS_EVENT));
}

/** 有任一译本离线包，或当前在线（API 可读），即视为可开始读 */
export async function isReadingPackReady(): Promise<boolean> {
  if (await isOfflinePackReady()) return true;
  if (await isAutoBiblePackReady()) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine) return true;
  return false;
}

export async function resolveHomeOnboarding(): Promise<HomeOnboardingState> {
  const packReady = await isReadingPackReady();
  const plan = getActivePlan();
  if (!packReady) {
    return {
      stage: 'S0',
      packReady: false,
      planId: plan?.planId ?? null,
      planTitle: plan?.title ?? null,
      planDay: plan ? getPlanDay(plan.planId) : 0,
      day1Done: false,
    };
  }
  if (!plan) {
    return {
      stage: 'S1',
      packReady: true,
      planId: null,
      planTitle: null,
      planDay: 0,
      day1Done: false,
    };
  }
  const done = getCompletedPlanDays(plan.planId);
  const day1Done = done.includes(1);
  const planDay = getPlanDay(plan.planId);
  if (!day1Done && planDay <= 1) {
    return {
      stage: 'S2',
      packReady: true,
      planId: plan.planId,
      planTitle: plan.title,
      planDay,
      day1Done: false,
    };
  }
  return {
    stage: 'S3',
    packReady: true,
    planId: plan.planId,
    planTitle: plan.title,
    planDay,
    day1Done: true,
  };
}

export function onboardingCta(stage: HomeOnboardingStage): HomeOnboardingCta {
  switch (stage) {
    case 'S0':
      return {
        title: '离线时需先下载经包',
        body: '当前无网络且本机尚无经文。连上网络可直接读；或下载经包后离线也能打开。',
        href: '/reader?book=JHN&chapter=1',
        label: '试试打开圣经',
        secondaryHref: '/profile?settings=1',
        secondaryLabel: '去下载经包',
      };
    case 'S1':
      return {
        title: '先读起来，或选个计划',
        body: '可从约翰福音自由开读；想按日程走再选计划。',
        href: '/reader?book=JHN&chapter=1',
        label: '从约翰福音开始',
        secondaryHref: '/plans',
        secondaryLabel: '浏览读经计划',
      };
    case 'S2':
      return {
        title: '完成第一天',
        body: '迈出第一步就好，今天只需读一小段。',
        href: '/',
        label: '开始今日阅读',
      };
    default:
      return {
        title: '',
        body: '',
        href: '/',
        label: '',
      };
  }
}
