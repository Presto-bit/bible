package cn.prestoai.peiai

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import java.util.Calendar
import java.util.Locale

/**
 * 本地准时闹钟：关 App / 杀进程后仍可在设定时段唤醒发通知。
 * 偏好存 SharedPreferences，开机由 BootReceiver 重挂。
 */
object ReminderScheduler {
  const val PREFS = "peiai_reminders"
  const val KIND_DAILY = "daily"
  const val KIND_GROUP = "group"

  const val RC_DAILY = 7101
  const val RC_GROUP = 7102
  const val NOTIF_DAILY = 8101
  const val NOTIF_GROUP = 8102

  data class Spec(
    val kind: String,
    val enabled: Boolean,
    val hour: Int,
    val minute: Int,
    val title: String,
    val body: String,
    val openPath: String,
  )

  fun schedule(
    context: Context,
    kind: String,
    enabled: Boolean,
    hour: Int,
    minute: Int,
    title: String,
    body: String,
    openPath: String,
  ) {
    val app = context.applicationContext
    ShellNotifier.ensureChannel(app)
    val h = hour.coerceIn(0, 23)
    val m = minute.coerceIn(0, 59)
    val path = openPath.ifBlank { if (kind == KIND_GROUP) "/discover" else "/" }
    save(
      app,
      Spec(
        kind = kind,
        enabled = enabled,
        hour = h,
        minute = m,
        title = title.ifBlank { defaultTitle(kind) },
        body = body.ifBlank { defaultBody(kind) },
        openPath = path,
      ),
    )
    if (!enabled) {
      cancelAlarm(app, kind)
      return
    }
    cancelAlarm(app, kind)
    val triggerAt = nextTriggerMillis(h, m)
    val pi = pending(app, kind, triggerAt, repeating = true)
    val am = app.getSystemService(AlarmManager::class.java) ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        if (am.canScheduleExactAlarms()) {
          am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
        } else {
          am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
        }
      } else {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
      }
    } catch (_: SecurityException) {
      try {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
      } catch (_: Exception) {
        /* ignore */
      }
    } catch (_: Exception) {
      /* ignore */
    }
  }

  fun cancel(context: Context, kind: String) {
    val app = context.applicationContext
    val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit().putBoolean(key(kind, "enabled"), false).apply()
    cancelAlarm(app, kind)
  }

  fun rescheduleAll(context: Context) {
    val app = context.applicationContext
    for (kind in listOf(KIND_DAILY, KIND_GROUP)) {
      val spec = load(app, kind) ?: continue
      if (!spec.enabled) continue
      schedule(
        app,
        kind = kind,
        enabled = true,
        hour = spec.hour,
        minute = spec.minute,
        title = spec.title,
        body = spec.body,
        openPath = spec.openPath,
      )
    }
  }

  /** 闹钟到点：展示通知，并重排次日同刻。 */
  fun onAlarmFired(context: Context, kind: String) {
    val app = context.applicationContext
    val spec = load(app, kind) ?: return
    if (!spec.enabled) return
    val notifId = if (kind == KIND_GROUP) NOTIF_GROUP else NOTIF_DAILY
    ShellNotifier.showReminder(
      app,
      notificationId = notifId,
      title = spec.title,
      body = spec.body,
      openPath = spec.openPath,
    )
    // 重挂下一次
    schedule(
      app,
      kind = kind,
      enabled = true,
      hour = spec.hour,
      minute = spec.minute,
      title = spec.title,
      body = spec.body,
      openPath = spec.openPath,
    )
  }

  fun load(context: Context, kind: String): Spec? {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!prefs.contains(key(kind, "hour"))) return null
    return Spec(
      kind = kind,
      enabled = prefs.getBoolean(key(kind, "enabled"), false),
      hour = prefs.getInt(key(kind, "hour"), 8),
      minute = prefs.getInt(key(kind, "minute"), 0),
      title = prefs.getString(key(kind, "title"), defaultTitle(kind)) ?: defaultTitle(kind),
      body = prefs.getString(key(kind, "body"), defaultBody(kind)) ?: defaultBody(kind),
      openPath = prefs.getString(key(kind, "path"), "/") ?: "/",
    )
  }

  private fun save(context: Context, spec: Spec) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean(key(spec.kind, "enabled"), spec.enabled)
      .putInt(key(spec.kind, "hour"), spec.hour)
      .putInt(key(spec.kind, "minute"), spec.minute)
      .putString(key(spec.kind, "title"), spec.title)
      .putString(key(spec.kind, "body"), spec.body)
      .putString(key(spec.kind, "path"), spec.openPath)
      .apply()
  }

  private fun cancelAlarm(context: Context, kind: String) {
    val am = context.getSystemService(AlarmManager::class.java) ?: return
    val pi = pending(context, kind, System.currentTimeMillis(), repeating = false)
    am.cancel(pi)
    pi.cancel()
  }

  private fun pending(
    context: Context,
    kind: String,
    triggerAt: Long,
    repeating: Boolean,
  ): PendingIntent {
    val intent = Intent(context, ReminderReceiver::class.java).apply {
      action = ReminderReceiver.ACTION_FIRE
      putExtra(ReminderReceiver.EXTRA_KIND, kind)
      // 附带时间戳，保证 intent 唯一性时仍匹配 requestCode
      putExtra("trigger_hint", if (repeating) 0L else triggerAt)
    }
    val requestCode = if (kind == KIND_GROUP) RC_GROUP else RC_DAILY
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getBroadcast(context, requestCode, intent, flags)
  }

  private fun nextTriggerMillis(hour: Int, minute: Int): Long {
    val cal = Calendar.getInstance(Locale.CHINA)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    cal.set(Calendar.HOUR_OF_DAY, hour)
    cal.set(Calendar.MINUTE, minute)
    if (cal.timeInMillis <= System.currentTimeMillis() + 2_000L) {
      cal.add(Calendar.DAY_OF_YEAR, 1)
    }
    return cal.timeInMillis
  }

  private fun key(kind: String, field: String) = "${kind}_$field"

  private fun defaultTitle(kind: String) =
    if (kind == KIND_GROUP) "群打卡提醒" else "彼爱 · 今日读经"

  private fun defaultBody(kind: String) =
    if (kind == KIND_GROUP) "轻轻完成今天的打卡就好。"
    else "愿话语成为你脚前的灯，点开继续今天的阅读。"

  /** 调试：约 15s 后触发一次（不改 prefs） */
  fun scheduleDebugInSeconds(context: Context, seconds: Int = 15) {
    val app = context.applicationContext
    ShellNotifier.ensureChannel(app)
    val am = app.getSystemService(AlarmManager::class.java) ?: return
    val intent = Intent(app, ReminderReceiver::class.java).apply {
      action = ReminderReceiver.ACTION_FIRE
      putExtra(ReminderReceiver.EXTRA_KIND, KIND_DAILY)
      putExtra(ReminderReceiver.EXTRA_ONE_SHOT, true)
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    val pi = PendingIntent.getBroadcast(app, 7199, intent, flags)
    val whenMs = SystemClock.elapsedRealtime() + seconds * 1000L
    am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, whenMs, pi)
  }
}
