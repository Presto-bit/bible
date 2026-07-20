/** 账号引导：设密改「我的」软催；遗留门闸/用户名引导兼容 */

import { hasPassword } from './api';
import { userLsGet } from './user_storage';

const DISMISSED_KEY = 'presto_username_guide_dismissed';
const DATA_KEY = 'presto_has_local_data';
const GATE_SEEN_KEY = 'presto_account_gate_seen';
const GUEST_RISK_KEY = 'presto_guest_risk_accepted';

export const ACCOUNT_GATE_DONE_EVENT = 'presto-account-gate-done';

export function markLocalDataCreated() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DATA_KEY, '1');
}

export function dismissUsernameGuide() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DISMISSED_KEY, '1');
}

/** 是否已走过首次账号门闸（设密成功或明确选游客） */
export function hasSeenAccountGate(): boolean {
  if (typeof window === 'undefined') return true;
  if (localStorage.getItem(GATE_SEEN_KEY) === '1') return true;
  // 兼容旧版：曾关掉用户名引导 / 已完成账号
  if (localStorage.getItem(DISMISSED_KEY)) return true;
  if (isAccountComplete()) return true;
  return false;
}

export function hasAcceptedGuestRisk(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(GUEST_RISK_KEY) === '1';
}

export function markAccountGateSeen() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GATE_SEEN_KEY, '1');
  dismissUsernameGuide();
  window.dispatchEvent(new Event(ACCOUNT_GATE_DONE_EVENT));
}

export function acceptGuestRisk() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GUEST_RISK_KEY, '1');
  markAccountGateSeen();
}

/**
 * 首次门闸：已改为不自动弹窗（「我的」AccountSecurityCard 软催）。
 * 保留函数供兼容旧调用；恒为 false。
 */
export function shouldPromptAccountGate(): boolean {
  return false;
}

/**
 * 旧逻辑：产生本地数据后弹用户名引导。
 * 门闸落地后不再自动弹出（改由「我的」安全卡软催）。
 */
export function shouldPromptUsername(): boolean {
  return false;
}

/** 用户名 + 密码均已设置，视为账号引导完成 */
export function isAccountComplete(): boolean {
  if (typeof window === 'undefined') return false;
  const name = (userLsGet('profile_name') || '').trim();
  return name.length >= 2 && hasPassword();
}

export function hasSecuredAccount(): boolean {
  return isAccountComplete() || Boolean(
    typeof window !== 'undefined' && localStorage.getItem('account_phone'),
  );
}
