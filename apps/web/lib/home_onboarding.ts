/**
 * 首页 Onboarding 状态机 S0–S3（U12 / PRODUCT §5.1）
 * S0 经包未就绪 → S1 未选计划 → S2 首日未完成 → S3 常规
 */

import { isOfflinePackReady } from './offline_pack';
import {
  getActivePlan,
  getCompletedPlanDays,
  getPlanDay,
} from './plan_progress';

export type HomeOnboardingStage = 'S0' | 'S1' | 'S2' | 'S3';

export interface HomeOnboardingState {
  stage: HomeOnboardingStage;
  /** 经包是否可用 */
  packReady: boolean;
  planId: string | null;
  planTitle: string | null;
  planDay: number;
  day1Done: boolean;
}

export async function resolveHomeOnboarding(): Promise<HomeOnboardingState> {
  const packReady = await isOfflinePackReady();
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

export function onboardingCta(stage: HomeOnboardingStage): { title: string; body: string; href: string; label: string } {
  switch (stage) {
    case 'S0':
      return {
        title: '下载经包，开始阅读',
        body: '离线经文与注释库需先下载到本机，约需几分钟。',
        href: '/profile',
        label: '去下载经包',
      };
    case 'S1':
      return {
        title: '选一个读经计划',
        body: '推荐「新约 30 天」，每天只需几分钟；也可先去圣经自由选书。',
        href: '/plans',
        label: '浏览计划',
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
