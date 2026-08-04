package cn.prestoai.peiai

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.browser.customtabs.CustomTabsClient
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.google.androidbrowserhelper.trusted.LauncherActivity as AbhLauncherActivity

/**
 * Chrome-hosted PWA 入口：品牌开屏后拉起 Trusted Web Activity。
 * 不渲染业务页；业务与 SW 全在源站 Chrome 运行时。
 */
class LauncherActivity : AbhLauncherActivity() {

  private var keepSplash = true

  override fun onCreate(savedInstanceState: Bundle?) {
    val splash = installSplashScreen()
    splash.setKeepOnScreenCondition { keepSplash }
    ShellNotifier.ensureReminderChannel(this)
    ReminderScheduler.rescheduleAll(this)

    if (!hasChromeProvider()) {
      keepSplash = false
      startActivity(Intent(this, ChromeMissingActivity::class.java))
      finish()
      return
    }

    super.onCreate(savedInstanceState)
    // TWA 已接管界面；尽快撤开屏
    window.decorView.post { keepSplash = false }
    window.decorView.postDelayed({ keepSplash = false }, 2_400)
  }

  /**
   * 在启动 URL 上附带 host 标记，供 H5 识别能力宿主版本（随后由 H5 写入 storage 并清理 query）。
   */
  override fun getLaunchingUrl(): Uri {
    val incoming = intent?.data
    val base = when {
      incoming != null
        && incoming.scheme == "https"
        && incoming.host == HostConstants.HOST -> incoming
      else -> {
        try {
          super.getLaunchingUrl()
        } catch (_: Exception) {
          null
        } ?: Uri.parse(BuildConfig.DEFAULT_URL)
      }
    }
    val b = base.buildUpon().clearQuery()
    for (name in base.queryParameterNames) {
      if (name.startsWith("peiai_")) continue
      for (value in base.getQueryParameters(name)) {
        b.appendQueryParameter(name, value)
      }
    }
    b.appendQueryParameter(HostConstants.Q_HOST, HostConstants.HOST_VALUE)
    b.appendQueryParameter(HostConstants.Q_VN, BuildConfig.VERSION_NAME)
    b.appendQueryParameter(HostConstants.Q_VC, BuildConfig.VERSION_CODE.toString())
    if (!base.fragment.isNullOrEmpty()) {
      b.encodedFragment(base.encodedFragment)
    }
    return b.build()
  }

  private fun hasChromeProvider(): Boolean {
    val pkg = CustomTabsClient.getPackageName(
      this,
      listOf(
        "com.android.chrome",
        "com.chrome.beta",
        "com.chrome.dev",
        "com.chrome.canary",
        "com.google.android.apps.chrome",
      ),
      true,
    )
    return !pkg.isNullOrBlank()
  }
}
