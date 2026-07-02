/** 首次产生本地数据后，轻引导设置用户名（一次） */

import { hasPassword } from './api';

const DISMISSED_KEY = 'presto_username_guide_dismissed';
const DATA_KEY = 'presto_has_local_data';

export function markLocalDataCreated() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DATA_KEY, '1');
}

export function dismissUsernameGuide() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DISMISSED_KEY, '1');
}

export function shouldPromptUsername(): boolean {
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem(DISMISSED_KEY)) return false;
  if (!localStorage.getItem(DATA_KEY)) return false;
  const name = (localStorage.getItem('profile_name') || '').trim();
  if (name.length >= 2) return false;
  if (hasPassword()) return false;
  return true;
}

export function hasSecuredAccount(): boolean {
  if (typeof window === 'undefined') return false;
  const name = (localStorage.getItem('profile_name') || '').trim();
  return name.length >= 2 || hasPassword() || Boolean(localStorage.getItem('account_phone'));
}
