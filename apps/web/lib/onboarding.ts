export const ONBOARDING_SEEN_KEY = 'presto_onboarding_seen';
export const ONBOARDING_DONE_EVENT = 'presto-onboarding-done';

export function isOnboardingSeen(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(ONBOARDING_SEEN_KEY) === '1';
}
