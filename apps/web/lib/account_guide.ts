/** 账号引导：称呼归 Hero；密码+手机归「我的」；未设密不同步；勿在其它 Tab 全屏催设密 */

import { getBoundPhone, hasPassword } from './api';

const DISMISSED_KEY = 'presto_username_guide_dismissed';
const DATA_KEY = 'presto_has_local_data';
const GATE_SEEN_KEY = 'presto_account_gate_seen';
const GUEST_RISK_KEY = 'presto_guest_risk_accepted';
/** 首启跳过设密后，在「我的」高亮软催一次 */
const PROFILE_PASSWORD_NUDGE_KEY = 'presto_profile_password_nudge';

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
  // 已废弃首访全屏门闸；设密只在「我的」
  return false;
}

export function shouldPromptUsername(): boolean {
  return false;
}

/** standalone 首启结束后：未设密时在「我的」轻提示（非遮罩） */
export function markProfilePasswordNudge() {
  if (typeof window === 'undefined') return;
  if (hasPassword()) return;
  try {
    localStorage.setItem(PROFILE_PASSWORD_NUDGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function hasProfilePasswordNudge(): boolean {
  if (typeof window === 'undefined') return false;
  if (hasPassword()) return false;
  try {
    return localStorage.getItem(PROFILE_PASSWORD_NUDGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearProfilePasswordNudge() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PROFILE_PASSWORD_NUDGE_KEY);
  } catch {
    /* ignore */
  }
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

/** 云同步门槛：必须已设密码（手机仅便于登录，不挡同步） */
export function canCloudSync(): boolean {
  if (typeof window === 'undefined') return false;
  return hasPassword();
}

/** 「我的」身份区数据状态 */
export function accountDataStatus(): string | null {
  if (!hasPassword()) return '未设密码 · 数据仅本机，暂不同步';
  if (!hasBoundPhone()) return '已云同步 · 建议绑定手机';
  return null;
}

/** 「我的」细条文案：一屏一事 */
export function accountRecoveryHint(): string | null {
  if (!hasPassword()) return '设置密码后才会云同步，换机可找回';
  if (!hasBoundPhone()) return '绑定手机，登录更方便';
  return null;
}
