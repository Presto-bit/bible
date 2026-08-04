package cn.prestoai.peiai

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 本地闹钟到点：弹通知并由 Scheduler 重挂次日。 */
class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != ACTION_FIRE) return
    val kind = intent.getStringExtra(EXTRA_KIND) ?: ReminderScheduler.KIND_DAILY
    ReminderScheduler.onAlarmFired(context.applicationContext, kind)
  }

  companion object {
    const val ACTION_FIRE = "cn.prestoai.peiai.action.REMINDER_FIRE"
    const val EXTRA_KIND = "kind"
  }
}
