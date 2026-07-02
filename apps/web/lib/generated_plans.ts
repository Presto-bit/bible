import type { GeneratedPlan } from './api';

const KEY = 'presto_generated_plans';

export function loadGeneratedPlans(): GeneratedPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGeneratedPlans(plans: GeneratedPlan[]) {
  localStorage.setItem(KEY, JSON.stringify(plans));
}

export function saveGeneratedPlan(plan: GeneratedPlan): GeneratedPlan {
  const withMeta: GeneratedPlan = { ...plan, saved_at: plan.saved_at ?? Date.now() };
  const next = [withMeta, ...loadGeneratedPlans().filter((p) => p.id !== plan.id)].slice(0, 20);
  writeGeneratedPlans(next);
  return withMeta;
}

export function removeGeneratedPlan(planId: string) {
  writeGeneratedPlans(loadGeneratedPlans().filter((p) => p.id !== planId));
}

export function touchGeneratedPlan(planId: string) {
  const list = loadGeneratedPlans();
  const idx = list.findIndex((p) => p.id === planId);
  if (idx < 0) return;
  const updated = { ...list[idx], saved_at: Date.now() };
  const next = [updated, ...list.filter((p) => p.id !== planId)];
  writeGeneratedPlans(next);
}
