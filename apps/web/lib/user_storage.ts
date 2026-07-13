/**
 * 用户私有 localStorage 按 user_code 分桶。
 * 旧版全局键由首个认领的账号接收（claim-once），避免同机第二账号误拷。
 * 不依赖 api.ts，避免与身份模块循环引用。
 */

/** 统一认领标记（读经另有 presto_reading_legacy_claimed，互不覆盖） */
export const USER_DATA_LEGACY_CLAIMED_KEY = 'presto_user_data_legacy_claimed';

/** 需要 claim-once 迁入分桶的用户私有键 */
export const USER_SCOPED_BASES = [
  'presto_notes',
  'reader_highlights_v2',
  'reader_highlights_v1',
  'reader_highlight_styles_v1',
  'reader_margin_notes_v1',
  'reader_marks_meta_v1',
  'highlight_sync_ids_v1',
  'highlight_sync_versions_v1',
  'reader_favorites_v1',
  'bookmark_sync_ids_v1',
  'bookmark_sync_versions_v1',
  'presto_active_plan',
  'presto_plan_day',
  'presto_plan_done_days',
  'presto_plan_skipped_days',
  'presto_completed_plans',
  'presto_plan_meta_cache',
  'presto_plan_sessions',
  'presto_generated_plans',
  'presto_plan_reflections',
  'presto_badge_stats',
  'presto_quiz_progress',
  'presto_ai_quiz_progress',
  'presto_challenge_level_progress',
  'presto_pending_book_challenge',
  'presto_book_challenge_pushed',
  'presto_q_answer_history',
  'presto_daily_quiz_day',
  'assistant_sessions_v1',
  'assistant_draft_v1',
  'presto_ai_session_versions',
  'verse_thoughts_v2',
  'verse_thoughts_v1',
  'notes_migrated_to_thoughts_v2',
  'thought_visibility_pref',
  'presto_prayer_log',
  'profile_avatar',
  'profile_name',
  'profile_bio',
  'group_checkin_queue',
  'friend_remarks_v1',
  'reading_amen_v1',
  'group_gentle_nudge',
  'mark_note_links_v1',
  'presto_xiaoai_halfsheet_v1',
] as const;

function accountId(userCode?: string): string {
  if (userCode) return userCode.trim();
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem('presto_user_id') ||
    localStorage.getItem('presto_guest_id') ||
    ''
  ).trim();
}

export function scopedUserKey(base: string, userCode?: string): string {
  const id = accountId(userCode);
  return id ? `${base}:${id}` : base;
}

function copyIfMissing(fromKey: string, toKey: string) {
  if (fromKey === toKey) return;
  if (localStorage.getItem(toKey) != null) return;
  const v = localStorage.getItem(fromKey);
  if (v == null || v === '') return;
  localStorage.setItem(toKey, v);
}

const migratedAccounts = new Set<string>();

/**
 * 将 USER_SCOPED_BASES 中的旧全局键迁入当前账号桶（每账号进程内一次）。
 * 全局键仅由首个认领的账号接收。
 */
export function migrateLegacyUserStorageIfNeeded(userCode?: string): void {
  if (typeof window === 'undefined') return;
  const id = accountId(userCode);
  if (!id || migratedAccounts.has(id)) return;
  migratedAccounts.add(id);

  const claimed = (localStorage.getItem(USER_DATA_LEGACY_CLAIMED_KEY) || '').trim();
  if (claimed && claimed !== id) return;

  for (const base of USER_SCOPED_BASES) {
    copyIfMissing(base, scopedUserKey(base, id));
  }

  // thought_draft_v1:{ref} 前缀键
  try {
    const draftPrefix = 'thought_draft_v1:';
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(draftPrefix)) continue;
      const rest = key.slice(draftPrefix.length);
      if (/^\d{8,10}:/.test(rest)) continue;
      copyIfMissing(key, `${draftPrefix}${id}:${rest}`);
    }
  } catch {
    /* ignore */
  }

  if (!claimed) localStorage.setItem(USER_DATA_LEGACY_CLAIMED_KEY, id);
}

export function userLsGet(base: string, userCode?: string): string | null {
  migrateLegacyUserStorageIfNeeded(userCode);
  return localStorage.getItem(scopedUserKey(base, userCode));
}

export function userLsSet(base: string, value: string, userCode?: string): void {
  migrateLegacyUserStorageIfNeeded(userCode);
  localStorage.setItem(scopedUserKey(base, userCode), value);
}

export function userLsRemove(base: string, userCode?: string): void {
  migrateLegacyUserStorageIfNeeded(userCode);
  localStorage.removeItem(scopedUserKey(base, userCode));
}

/** 带动态后缀的键：如 thought_draft_v1:{ref} → thought_draft_v1:{id}:{ref} */
export function scopedPrefixedKey(prefix: string, suffix: string, userCode?: string): string {
  const id = accountId(userCode);
  return id ? `${prefix}${id}:${suffix}` : `${prefix}${suffix}`;
}

export function userPrefixedGet(prefix: string, suffix: string, userCode?: string): string | null {
  migrateLegacyUserStorageIfNeeded(userCode);
  return localStorage.getItem(scopedPrefixedKey(prefix, suffix, userCode));
}

export function userPrefixedSet(
  prefix: string,
  suffix: string,
  value: string,
  userCode?: string,
): void {
  migrateLegacyUserStorageIfNeeded(userCode);
  localStorage.setItem(scopedPrefixedKey(prefix, suffix, userCode), value);
}

export function userPrefixedRemove(prefix: string, suffix: string, userCode?: string): void {
  migrateLegacyUserStorageIfNeeded(userCode);
  localStorage.removeItem(scopedPrefixedKey(prefix, suffix, userCode));
}
