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

export function saveGeneratedPlan(plan: GeneratedPlan) {
  const next = [plan, ...loadGeneratedPlans().filter((p) => p.id !== plan.id)].slice(0, 12);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
