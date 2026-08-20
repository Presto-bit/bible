package cn.prestoai.presto_bible

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.browser.customtabs.CustomTabsServiceConnection
import androidx.browser.customtabs.CustomTabsSession

/**
 * 创世记 50：全屏 Chrome Custom Tabs（Chrome 内核，避免 System WebView 空白）。
 * UI：全屏；顶栏仅 ×（右侧）；纸白工具条；地址栏滚动收起；无分享/无标题。
 */
object Genesis50CustomTabHelper {
  /** 仅列出确认支持 Custom Tabs 服务的浏览器（小米/系统浏览器走 ACTION_VIEW 降级）。 */
  private val customTabPackages =
    listOf(
      "com.android.chrome",
      "com.google.android.apps.chrome",
      "com.chrome.beta",
      "com.chrome.dev",
      "com.chrome.canary",
      "org.mozilla.firefox",
      "com.microsoft.emmx",
      "com.sec.android.app.sbrowser",
    )

  private val systemBrowserPackages =
    listOf(
      "com.android.browser",
      "com.mi.globalbrowser",
      "com.android.chrome",
      "com.google.android.apps.chrome",
      "org.mozilla.firefox",
      "com.microsoft.emmx",
      "com.sec.android.app.sbrowser",
    )

  @Volatile
  private var customTabsClient: CustomTabsClient? = null

  @Volatile
  private var customTabsSession: CustomTabsSession? = null

  private var serviceConnection: CustomTabsServiceConnection? = null

  fun open(activity: Activity, url: String, toolbarColor: Int = Color.WHITE): Boolean {
    val uri =
      try {
        Uri.parse(url.trim())
      } catch (_: Exception) {
        return false
      }
    if (uri.scheme != "http" && uri.scheme != "https") return false

    val pkg =
      CustomTabsClient.getPackageName(activity, customTabPackages, true)
        ?: return openFallbackBrowser(activity, uri)

    ensureBound(activity, pkg)

    val schemeParams =
      CustomTabColorSchemeParams.Builder()
        .setToolbarColor(toolbarColor)
        .setNavigationBarColor(toolbarColor)
        .setSecondaryToolbarColor(toolbarColor)
        .setNavigationBarDividerColor(toolbarColor)
        .build()

    val session = customTabsSession
    val builder =
      if (session != null) {
        CustomTabsIntent.Builder(session)
      } else {
        CustomTabsIntent.Builder()
      }

    val customTabsIntent =
      builder
        .setDefaultColorSchemeParams(schemeParams)
        .setColorSchemeParams(CustomTabsIntent.COLOR_SCHEME_LIGHT, schemeParams)
        .setColorSchemeParams(CustomTabsIntent.COLOR_SCHEME_DARK, schemeParams)
        .setShowTitle(false)
        .setUrlBarHidingEnabled(true)
        .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
        .setCloseButtonPosition(CustomTabsIntent.CLOSE_BUTTON_POSITION_END)
        .build()

    customTabsIntent.intent.setPackage(pkg)
    customTabsIntent.intent.putExtra(
      CustomTabsIntent.EXTRA_TITLE_VISIBILITY_STATE,
      CustomTabsIntent.NO_TITLE,
    )
    customTabsIntent.intent.putExtra(CustomTabsIntent.EXTRA_ENABLE_URLBAR_HIDING, true)

    return try {
      customTabsIntent.launchUrl(activity, uri)
      true
    } catch (_: ActivityNotFoundException) {
      openFallbackBrowser(activity, uri)
    } catch (_: Exception) {
      openFallbackBrowser(activity, uri)
    }
  }

  /** 预热并保持 CustomTabsSession，缩短首开白屏。 */
  fun warmUp(activity: Activity) {
    val pkg = CustomTabsClient.getPackageName(activity, customTabPackages, true) ?: return
    ensureBound(activity, pkg)
  }

  private fun ensureBound(activity: Activity, pkg: String) {
    if (customTabsSession != null && serviceConnection != null) return
    if (serviceConnection != null) return

    serviceConnection =
      object : CustomTabsServiceConnection() {
        override fun onCustomTabsServiceConnected(
          name: ComponentName,
          client: CustomTabsClient,
        ) {
          customTabsClient = client
          client.warmup(0L)
          customTabsSession = client.newSession(null)
        }

        override fun onServiceDisconnected(name: ComponentName) {
          customTabsClient = null
          customTabsSession = null
          serviceConnection = null
        }
      }

    try {
      CustomTabsClient.bindCustomTabsService(activity, pkg, serviceConnection!!)
    } catch (_: Exception) {
      serviceConnection = null
    }
  }

  private fun openFallbackBrowser(activity: Activity, uri: Uri): Boolean {
    for (pkg in systemBrowserPackages) {
      try {
        val intent =
          Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage(pkg)
          }
        if (activity.packageManager.resolveActivity(intent, 0) == null) continue
        activity.startActivity(intent)
        return true
      } catch (_: Exception) {
        // 试下一个浏览器
      }
    }
    return try {
      activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
      true
    } catch (_: Exception) {
      false
    }
  }
}
