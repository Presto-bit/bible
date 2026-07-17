/**
 * 统一通知编排：前台 setTimeout 兜底 + 服务端 Web Push。
 * - 每日读经：subscribe 同步时段 → cron/tick 投递
 * - 社交摘要：发消息后服务端 1 分钟 debounce 合并推送
 * - 群打卡晚间：前台兜底（未打卡检测）
 */

import { getReminder, reschedule as rescheduleDaily } from './reminder';
import { getGroupEveningReminder, rescheduleGroupEveningReminder } from './group_reminder';
import { startDigestPoller } from './push_digest';
import { subscribeWebPush } from './web_push';

let booted = false;

/** 应用启动时调用一次 */
export function initNotificationServices(): void {
  if (typeof window === 'undefined' || booted) return;
  booted = true;
  rescheduleDaily();
  rescheduleGroupEveningReminder();
  startDigestPoller();
  void syncPushSubscription();
}

/** 偏好变更后同步订阅到服务端 */
export async function syncPushSubscription(): Promise<boolean> {
  const rem = getReminder();
  const group = getGroupEveningReminder();
  if (!rem.enabled && !group.enabled) {
    try {
      return await subscribeWebPush();
    } catch {
      return false;
    }
  }
  try {
    return await subscribeWebPush();
  } catch {
    return false;
  }
}

export function rescheduleAllNotifications(): void {
  rescheduleDaily();
  rescheduleGroupEveningReminder();
  void syncPushSubscription();
}
