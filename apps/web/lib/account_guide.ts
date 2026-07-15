/** 账号引导：首次门闸设密 / 游客风险确认；遗留用户名引导兼容 */

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

/** 首次门闸：未设密且未确认过游客风险 */
export function shouldPromptAccountGate(): boolean {
  if (typeof window === 'undefined') return false;
  if (isAccountComplete()) return false;
  if (hasSeenAccountGate()) return false;
  return true;
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
