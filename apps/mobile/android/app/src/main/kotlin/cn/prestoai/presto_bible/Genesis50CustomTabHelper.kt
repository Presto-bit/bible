package cn.prestoai.presto_bible

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.browser.customtabs.CustomTabsServiceConnection
import androidx.browser.customtabs.CustomTabsSession

/**
 * 创世记 50：全屏 Custom Tabs 打开活动站。
 * 希伯来书 30 先走 App 内 WebView（open_hebrews30_page.dart），失败再进这里。
 *
 * 鸿蒙 / 华为 / 荣耀：优先华为系浏览器（机上 Chrome 常残缺，会导致外站
 * Supabase RPC 误报「网络问题」）；其它机型仍优先 Chrome。
 */
object Genesis50CustomTabHelper {
  /** 华为 / 荣耀自带或应用市场浏览器。 */
  private val huaweiBrowserPackages =
    listOf(
      "com.huawei.browser",
      "com.hihonor.browser",
      "com.huawei.hwbrowser",
    )

  private val chromePackages =
    listOf(
      "com.android.chrome",
      "com.google.android.apps.chrome",
      "com.chrome.beta",
      "com.chrome.dev",
      "com.chrome.canary",
    )

  /** 支持 Custom Tabs 的通用浏览器（不含华为 / Chrome，由调用方拼优先级）。 */
  private val otherCustomTabPackages =
    listOf(
      "org.mozilla.firefox",
      "com.microsoft.emmx",
      "com.sec.android.app.sbrowser",
    )

  private val systemBrowserPackages =
    listOf(
      "com.android.browser",
      "com.mi.globalbrowser",
    ) + huaweiBrowserPackages + otherCustomTabPackages + chromePackages

  @Volatile
  private var customTabsClient: CustomTabsClient? = null

  @Volatile
  private var customTabsSession: CustomTabsSession? = null

  private var serviceConnection: CustomTabsServiceConnection? = null

  fun isHuaweiFamily(): Boolean {
    val manufacturer = Build.MANUFACTURER.orEmpty().lowercase()
    val brand = Build.BRAND.orEmpty().lowercase()
    return manufacturer.contains("huawei") ||
      manufacturer.contains("honor") ||
      brand.contains("huawei") ||
      brand.contains("honor")
  }

  /**
   * Custom Tabs 候选包名（有序）。
   * 华为系：华为浏览器 → 其它非 Chrome → Chrome 垫底（避免残缺 Chrome 抢先）。
   */
  fun preferredCustomTabPackages(): List<String> =
    if (isHuaweiFamily()) {
      huaweiBrowserPackages + otherCustomTabPackages + chromePackages
    } else {
      chromePackages + otherCustomTabPackages + huaweiBrowserPackages
    }

  /** ACTION_VIEW 降级时的包名顺序。 */
  fun preferredSystemBrowserPackages(): List<String> =
    if (isHuaweiFamily()) {
      huaweiBrowserPackages +
        listOf("com.android.browser", "com.mi.globalbrowser") +
        otherCustomTabPackages +
        chromePackages
    } else {
      systemBrowserPackages
    }

  fun open(activity: Activity, url: String, toolbarColor: Int = Color.WHITE): Boolean {
    val uri =
      try {
        Uri.parse(url.trim())
      } catch (_: Exception) {
        return false
      }
    if (uri.scheme != "http" && uri.scheme != "https") return false

    val pkg = resolveCustomTabPackage(activity) ?: return openFallbackBrowser(activity, uri)

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
    val pkg = resolveCustomTabPackage(activity) ?: return
    ensureBound(activity, pkg)
  }

  /**
   * 华为系：先只在华为浏览器里找 Custom Tabs；没有再扩到完整候选列表。
   * 避免 `getPackageName` 在残缺 Chrome 上返回可用但实际网络异常的包。
   */
  private fun resolveCustomTabPackage(context: Context): String? {
    if (isHuaweiFamily()) {
      val huawei =
        CustomTabsClient.getPackageName(context, huaweiBrowserPackages, true)
      if (huawei != null) return huawei
    }
    return CustomTabsClient.getPackageName(context, preferredCustomTabPackages(), true)
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
    for (pkg in preferredSystemBrowserPackages()) {
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
    // 最后交给系统默认浏览器（鸿蒙上通常即华为浏览器）。
    return try {
      activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
      true
    } catch (_: Exception) {
      false
    }
  }
}
