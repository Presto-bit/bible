package cn.prestoai.peiai

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

/**
 * 彼爱安卓壳：全屏 WebView，不依赖 Chrome TWA / Custom Tabs。
 * 避免校验失败时出现地址栏与浏览器多标签（小米自带浏览器场景尤其明显）。
 */
class MainWebActivity : AppCompatActivity() {

  private lateinit var webView: WebView

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, true)

    webView = WebView(this).apply {
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      )
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.databaseEnabled = true
      settings.cacheMode = WebSettings.LOAD_DEFAULT
      settings.mediaPlaybackRequiresUserGesture = false
      settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
      settings.useWideViewPort = true
      settings.loadWithOverviewMode = true
      settings.setSupportZoom(false)
      settings.builtInZoomControls = false
      settings.displayZoomControls = false
      // 禁止多窗口抛到系统浏览器（小米 WebView 易把 _blank 或外链做成整页跳转）
      settings.setSupportMultipleWindows(false)
      settings.javaScriptCanOpenWindowsAutomatically = false
      // 供站点识别为「独立 App 壳」
      settings.userAgentString =
        settings.userAgentString + " PeiaiAndroidShell/" + BuildConfig.VERSION_NAME

      CookieManager.getInstance().setAcceptCookie(true)
      CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

      webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(
          view: WebView?,
          request: WebResourceRequest?,
        ): Boolean {
          val url = request?.url ?: return false
          return handleNav(view, url)
        }

        @Deprecated("Deprecated in Java")
        override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
          if (url.isNullOrBlank()) return false
          return handleNav(view, Uri.parse(url))
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
          super.onPageStarted(view, url, favicon)
        }
      }

      webChromeClient = object : WebChromeClient() {
        // 不实现 onCreateWindow → 多窗口不会开系统浏览器
      }
    }

    setContentView(webView)

    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          if (webView.canGoBack()) {
            webView.goBack()
          } else {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        }
      },
    )

    val startUrl = resolveStartUrl(intent) ?: DEFAULT_URL
    if (savedInstanceState != null) {
      webView.restoreState(savedInstanceState)
    } else {
      webView.loadUrl(startUrl)
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    resolveStartUrl(intent)?.let { url ->
      if (::webView.isInitialized) webView.loadUrl(url)
    }
  }

  private fun resolveStartUrl(intent: Intent?): String? {
    val data = intent?.data ?: return null
    if (isOwnHost(data.host) && (data.scheme == "https" || data.scheme == "http")) {
      return data.toString()
    }
    return null
  }

  private fun isOwnHost(host: String?): Boolean {
    if (host.isNullOrBlank()) return false
    return host.equals(HOST, ignoreCase = true)
      || host.endsWith(".$HOST", ignoreCase = true)
  }

  /**
   * @return true = 已拦截（外开或已在 WebView 加载）；false = 交给 WebView 默认加载
   */
  private fun handleNav(view: WebView?, uri: Uri): Boolean {
    val scheme = (uri.scheme ?: "").lowercase()
    if (scheme == "https" || scheme == "http") {
      if (isOwnHost(uri.host)) {
        // 站内交给 WebView，绝不抛出系统浏览器
        return false
      }
      openInExternalBrowser(uri)
      return true
    }
    // tel: / mailto: / market: 等
    return try {
      startActivity(Intent(Intent.ACTION_VIEW, uri))
      true
    } catch (_: ActivityNotFoundException) {
      true
    }
  }

  private fun openInExternalBrowser(uri: Uri) {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
    } catch (_: ActivityNotFoundException) {
      /* ignore */
    }
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    if (::webView.isInitialized) webView.saveState(outState)
  }

  override fun onPause() {
    if (::webView.isInitialized) webView.onPause()
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    if (::webView.isInitialized) webView.onResume()
  }

  override fun onDestroy() {
    if (::webView.isInitialized) {
      (webView.parent as? ViewGroup)?.removeView(webView)
      webView.destroy()
    }
    super.onDestroy()
  }

  companion object {
    const val HOST = "2sc.prestoai.cn"
    const val DEFAULT_URL = "https://2sc.prestoai.cn/"
  }
}
