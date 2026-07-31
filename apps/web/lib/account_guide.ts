/** 账号引导：称呼归 Hero；密码+手机归找回；软催不挡读经 */

import { getBoundPhone, hasPassword } from './api';

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
  if (localStorage.getItem(DISMISSED_KEY)) return true;
  if (hasSecuredAccount()) return true;
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

export function shouldPromptAccountGate(): boolean {
  return false;
}

export function shouldPromptUsername(): boolean {
  return false;
}

export function hasBoundPhone(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(getBoundPhone().trim());
}

/** 强完备：密码 + 手机（换机主路径） */
export function isAccountComplete(): boolean {
  if (typeof window === 'undefined') return false;
  return hasPassword() && hasBoundPhone();
}

/** 半完备：已设密、未绑手机 */
export function isAccountHalfComplete(): boolean {
  if (typeof window === 'undefined') return false;
  return hasPassword() && !hasBoundPhone();
}

/** 非纯游客：有密码或已绑手机 */
export function hasSecuredAccount(): boolean {
  if (typeof window === 'undefined') return false;
  return hasPassword() || hasBoundPhone();
}

/** 「我的」细条文案：一屏一事 */
export function accountRecoveryHint(): string | null {
  if (!hasPassword()) return '设置密码，换机可找回进度';
  if (!hasBoundPhone()) return '绑定手机，登录更方便';
  return null;
}
