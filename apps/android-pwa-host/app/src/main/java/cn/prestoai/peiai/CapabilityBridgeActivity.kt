package cn.prestoai.peiai

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.ContextCompat
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/**
 * 最小能力宿主入口（peiai://host/v1/...）。
 * 白名单：提醒调度、通知权限、应用/电池设置、APK 覆盖安装。
 * 处理完立即 finish，不渲染 UI。
 */
class CapabilityBridgeActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      handle(intent?.data)
    } catch (e: Exception) {
      toast("操作失败")
    } finally {
      finish()
    }
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    try {
      handle(intent?.data)
    } catch (_: Exception) {
      /* ignore */
    } finally {
      finish()
    }
  }

  private fun handle(uri: Uri?) {
    if (uri == null) return
    if (uri.scheme != HostConstants.BRIDGE_SCHEME) return
    if (uri.host != HostConstants.BRIDGE_HOST) return

    val segments = uri.pathSegments
    // /v1/<action>
    if (segments.size < 2 || segments[0] != "v1") return
    val action = segments[1]

    when (action) {
      "ping" -> { /* H5 仅探测可拉起 */ }
      "requestNotifications" -> requestNotifications()
      "scheduleReminder" -> scheduleReminder(uri)
      "cancelReminder" -> {
        val kind = uri.getQueryParameter("kind") ?: ReminderScheduler.KIND_DAILY
        ReminderScheduler.cancel(this, kind)
      }
      "openAppSettings" -> openAppSettings()
      "openExactAlarmSettings" -> openExactAlarmSettings()
      "openBatterySettings" -> openBatterySettings()
      "installApk" -> {
        val url = uri.getQueryParameter("url")?.let { decode(it) }.orEmpty()
        if (url.isNotBlank() && isAllowedApkUrl(url)) {
          ApkInstaller.downloadAndInstall(this, url)
        } else {
          toast("更新地址无效")
        }
      }
      else -> { /* 非白名单忽略 */ }
    }
  }

  private fun scheduleReminder(uri: Uri) {
    val kind = uri.getQueryParameter("kind") ?: ReminderScheduler.KIND_DAILY
    val enabled = (uri.getQueryParameter("enabled") ?: "0") == "1"
    val hour = uri.getQueryParameter("hour")?.toIntOrNull() ?: 8
    val minute = uri.getQueryParameter("minute")?.toIntOrNull() ?: 0
    val title = uri.getQueryParameter("title")?.let { decode(it) }.orEmpty()
    val body = uri.getQueryParameter("body")?.let { decode(it) }.orEmpty()
    val path = uri.getQueryParameter("path")?.let { decode(it) }.orEmpty()
    ReminderScheduler.schedule(
      this,
      kind = kind,
      enabled = enabled,
      hour = hour,
      minute = minute,
      title = title,
      body = body,
      openPath = path,
    )
  }

  private fun requestNotifications() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    if (
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
      == PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    // Activity 已马上 finish；用 Settings 面板作为可靠路径
    try {
      startActivity(
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
          putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        },
      )
    } catch (_: Exception) {
      openAppSettings()
    }
  }

  private fun openAppSettings() {
    try {
      startActivity(
        Intent(
          Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          Uri.parse("package:$packageName"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    } catch (_: Exception) {
      /* ignore */
    }
  }

  private fun openExactAlarmSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      openAppSettings()
      return
    }
    try {
      startActivity(
        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
          data = Uri.parse("package:$packageName")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        },
      )
    } catch (_: Exception) {
      openAppSettings()
    }
  }

  @SuppressLint("BatteryLife")
  private fun openBatterySettings() {
    try {
      val pm = getSystemService(PowerManager::class.java)
      if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
        startActivity(
          Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:$packageName"),
          ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        return
      }
    } catch (_: Exception) {
      /* fall through */
    }
    try {
      startActivity(
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    } catch (_: Exception) {
      openAppSettings()
    }
  }

  private fun isAllowedApkUrl(url: String): Boolean {
    return try {
      val u = Uri.parse(url)
      u.scheme == "https"
        && u.host == HostConstants.HOST
        && (u.path?.endsWith(".apk") == true || u.path?.contains("/downloads/") == true)
    } catch (_: Exception) {
      false
    }
  }

  private fun decode(raw: String): String =
    try {
      URLDecoder.decode(raw, StandardCharsets.UTF_8.name())
    } catch (_: Exception) {
      raw
    }

  private fun toast(msg: String) {
    Toast.makeText(applicationContext, msg, Toast.LENGTH_SHORT).show()
  }
}
