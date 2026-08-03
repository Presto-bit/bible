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
 * 避免校验失败时出现地址栏与浏览器多标签。
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
      // 供站点识别为「独立 App 壳」，抑制安装引导、走 standalone 逻辑
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
          return handleExternalNav(url)
        }

        @Deprecated("Deprecated in Java")
        override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
          if (url.isNullOrBlank()) return false
          return handleExternalNav(Uri.parse(url))
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
          super.onPageStarted(view, url, favicon)
        }
      }

      webChromeClient = WebChromeClient()
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

  private fun resolveStartUrl(intent: Intent?): String? {
    val data = intent?.data ?: return null
    if (data.scheme == "https" && data.host == HOST) {
      return data.toString()
    }
    return null
  }

  /** 本站内：WebView；外链：系统浏览器 / 外部 App */
  private fun handleExternalNav(uri: Uri): Boolean {
    val host = uri.host ?: return false
    val scheme = uri.scheme ?: return false
    if (scheme == "https" || scheme == "http") {
      if (host == HOST || host.endsWith(".$HOST")) {
        return false
      }
      openInExternalBrowser(uri)
      return true
    }
    // tel: / mailto: / intent: 等
    return try {
      startActivity(Intent(Intent.ACTION_VIEW, uri))
      true
    } catch (_: ActivityNotFoundException) {
      true
    }
  }

  private fun openInExternalBrowser(uri: Uri) {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, uri))
    } catch (_: ActivityNotFoundException) {
      /* ignore */
    }
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    webView.saveState(outState)
  }

  override fun onPause() {
    webView.onPause()
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    webView.onResume()
  }

  override fun onDestroy() {
    (webView.parent as? ViewGroup)?.removeView(webView)
    webView.destroy()
    super.onDestroy()
  }

  companion object {
    const val HOST = "2sc.prestoai.cn"
    const val DEFAULT_URL = "https://2sc.prestoai.cn/"
  }
}
