package cn.prestoai.peiai

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 开机 / 更新后重挂本地读经与群打卡闹钟。 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (
      action == Intent.ACTION_BOOT_COMPLETED
      || action == Intent.ACTION_MY_PACKAGE_REPLACED
    ) {
      ReminderScheduler.rescheduleAll(context.applicationContext)
    }
  }
}
