package cn.prestoai.peiai

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * 本地读经 / 打卡提醒通知。
 * 社交摘要走 Web Push（Chrome），不再做第二套原生社交通知中心。
 */
object ShellNotifier {
  const val CHANNEL_REMINDER = "peiai_reminder"
  private const val CHANNEL_REMINDER_NAME = "读经与打卡提醒"

  fun ensureReminderChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = context.getSystemService(NotificationManager::class.java) ?: return
    if (mgr.getNotificationChannel(CHANNEL_REMINDER) != null) return
    val channel = NotificationChannel(
      CHANNEL_REMINDER,
      CHANNEL_REMINDER_NAME,
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
      description = "每日读经与群打卡本地提醒"
      enableVibration(true)
      setShowBadge(true)
    }
    mgr.createNotificationChannel(channel)
  }

  fun showReminder(
    context: Context,
    notificationId: Int,
    title: String,
    body: String,
    openPath: String,
  ) {
    ensureReminderChannel(context)
    val path = if (openPath.startsWith("/")) openPath else "/$openPath"
    val uri = Uri.parse("${HostConstants.ORIGIN}$path")
    val intent = Intent(context, LauncherActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = uri
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    val pi = PendingIntent.getActivity(context, notificationId, intent, flags)

    val notif = NotificationCompat.Builder(context, CHANNEL_REMINDER)
      .setSmallIcon(R.drawable.ic_stat_notify)
      .setContentTitle(title.ifBlank { "彼爱" })
      .setContentText(body.ifBlank { "点开继续今天的阅读" })
      .setStyle(
        NotificationCompat.BigTextStyle()
          .bigText(body.ifBlank { "点开继续今天的阅读" }),
      )
      .setContentIntent(pi)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .build()

    try {
      NotificationManagerCompat.from(context).notify(notificationId, notif)
    } catch (_: SecurityException) {
      /* 无通知权限 */
    }
  }
}
