package cn.prestoai.peiai

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 本地闹钟到点：弹通知；若需每日循环则由 Scheduler 重挂。 */
class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != ACTION_FIRE) return
    val kind = intent.getStringExtra(EXTRA_KIND) ?: ReminderScheduler.KIND_DAILY
    val oneShot = intent.getBooleanExtra(EXTRA_ONE_SHOT, false)
    if (oneShot) {
      val title = "彼爱 · 今日读经"
      val body = "愿话语成为你脚前的灯，点开继续今天的阅读。"
      ShellNotifier.showReminder(
        context.applicationContext,
        notificationId = ReminderScheduler.NOTIF_DAILY,
        title = title,
        body = body,
        openPath = "/",
      )
      return
    }
    ReminderScheduler.onAlarmFired(context.applicationContext, kind)
  }

  companion object {
    const val ACTION_FIRE = "cn.prestoai.peiai.action.REMINDER_FIRE"
    const val EXTRA_KIND = "kind"
    const val EXTRA_ONE_SHOT = "one_shot"
  }
}
