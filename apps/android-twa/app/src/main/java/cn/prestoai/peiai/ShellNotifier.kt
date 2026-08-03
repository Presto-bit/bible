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
 * 壳内系统通知：日读经 / 群打卡本地闹钟 + 社交摘要（H5 桥即时弹出）。
 */
object ShellNotifier {
  const val CHANNEL_REMINDER = "peiai_reminder"
  const val CHANNEL_SOCIAL = "peiai_social"
  private const val CHANNEL_REMINDER_NAME = "读经与打卡提醒"
  private const val CHANNEL_SOCIAL_NAME = "消息提醒"
  /** 社交摘要默认通知 id；带 tag 时用稳定哈希覆盖 */
  private const val SOCIAL_NOTIF_BASE = 42_100

  fun ensureChannel(context: Context) {
    ensureReminderChannel(context)
    ensureSocialChannel(context)
  }

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

  fun ensureSocialChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = context.getSystemService(NotificationManager::class.java) ?: return
    if (mgr.getNotificationChannel(CHANNEL_SOCIAL) != null) return
    val channel = NotificationChannel(
      CHANNEL_SOCIAL,
      CHANNEL_SOCIAL_NAME,
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "群聊与私信摘要（App 在后台时）"
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
    notify(
      context = context,
      channelId = CHANNEL_REMINDER,
      notificationId = notificationId,
      title = title.ifBlank { "彼爱" },
      body = body.ifBlank { "点开继续今天的阅读" },
      openPath = openPath,
      category = NotificationCompat.CATEGORY_REMINDER,
      priority = NotificationCompat.PRIORITY_DEFAULT,
    )
  }

  /**
   * 社交摘要。tag 非空时用稳定 notificationId，同会话合并为一条。
   * @return true 已投递（或已尝试）；false 无权限等
   */
  fun showSocial(
    context: Context,
    title: String,
    body: String,
    openPath: String,
    tag: String?,
  ): Boolean {
    ensureSocialChannel(context)
    val id = if (tag.isNullOrBlank()) {
      SOCIAL_NOTIF_BASE
    } else {
      SOCIAL_NOTIF_BASE + (tag.hashCode() and 0x7fff)
    }
    return notify(
      context = context,
      channelId = CHANNEL_SOCIAL,
      notificationId = id,
      title = title.ifBlank { "彼爱" },
      body = body.ifBlank { "有新的消息" },
      openPath = openPath.ifBlank { "/discover" },
      category = NotificationCompat.CATEGORY_MESSAGE,
      priority = NotificationCompat.PRIORITY_HIGH,
    )
  }

  private fun notify(
    context: Context,
    channelId: String,
    notificationId: Int,
    title: String,
    body: String,
    openPath: String,
    category: String,
    priority: Int,
  ): Boolean {
    val path = if (openPath.startsWith("/")) openPath else "/$openPath"
    val uri = Uri.parse("https://${MainWebActivity.HOST}$path")
    val intent = Intent(context, MainWebActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = uri
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    val pi = PendingIntent.getActivity(context, notificationId, intent, flags)

    val notif = NotificationCompat.Builder(context, channelId)
      .setSmallIcon(R.drawable.ic_stat_notify)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setContentIntent(pi)
      .setAutoCancel(true)
      .setPriority(priority)
      .setCategory(category)
      .build()

    return try {
      NotificationManagerCompat.from(context).notify(notificationId, notif)
      true
    } catch (_: SecurityException) {
      false
    }
  }
}
