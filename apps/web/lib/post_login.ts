/** 登录成功后：合并游客额度 + 全量拉取云端（不在此自动弹窗合并） */
import { API_BASE, currentUserId, getDeviceId } from './api';
import { notifyLocalDataChanged } from './local_data_events';
import { syncResyncAccount } from './sync';
import {
  enqueueLocalReadingMigration,
  hasLocalReadingData,
} from './sync_migrate';

export async function mergeGuest(): Promise<void> {
  const uid = currentUserId();
  const device = getDeviceId();
  if (!uid || !device) return;
  try {
    await fetch(`${API_BASE}/auth/merge-guest`, {
      method: 'POST',
      headers: {
        'X-User-Id': uid,
        'X-User-Code': uid,
        'X-Guest-Id': getDeviceId(),
        'X-Device-Id': getDeviceId(),
      },
    });
  } catch {
    /* 离线或后端不可用 */
  }
}

export type AfterLoginResult = {
  pushed: number;
  pulled: number;
  ok: boolean;
  error?: string;
};

export async function afterLogin(): Promise<AfterLoginResult> {
  await mergeGuest();
  try {
    // 设密场景：本机已有阅读时先入队，避免只拉空云端、本地未上行
    if (hasLocalReadingData()) enqueueLocalReadingMigration();
    const result = await syncResyncAccount();
    notifyLocalDataChanged('after-login');
    void import('./reading_durable').then((m) => m.backupLocalReadingSnapshot());
    return { ...result, ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { pushed: 0, pulled: 0, ok: false, error };
  }
}
