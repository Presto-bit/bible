package cn.prestoai.peiai

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

/**
 * 彼爱安卓壳：全屏 WebView（非 Chrome TWA）。
 * - 边到边 + 系统栏 inset 注入 H5
 * - 站内 APK 下载并拉起安装
 * - 加载失败重试、文件选择、媒体权限
 */
class MainWebActivity : AppCompatActivity() {

  private lateinit var webView: WebView

  /** top, right, bottom, left（CSS px） */
  private var shellInsetsCss = floatArrayOf(0f, 0f, 0f, 0f)

  private var lastGoodUrl: String = DEFAULT_URL
  private var downloading = false
  private var filePathCallback: ValueCallback<Array<Uri>>? = null

  private val fileChooserLauncher =
    registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
      val cb = filePathCallback
      filePathCallback = null
      if (cb == null) return@registerForActivityResult
      if (result.resultCode != Activity.RESULT_OK || result.data == null) {
        cb.onReceiveValue(null)
        return@registerForActivityResult
      }
      val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
      cb.onReceiveValue(uris)
    }

  private val permissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { /* granted via WebPermission */ }

  private val pendingApkFile = java.util.concurrent.atomic.AtomicReference<File?>(null)

  private val installPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
      pendingApkFile.getAndSet(null)?.let { file ->
        if (canInstallPackages()) installApk(file)
        else toast("请允许「安装未知应用」后再试")
      }
    }

  private val io = Executors.newSingleThreadExecutor()

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setupEdgeToEdge()

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
      settings.setSupportMultipleWindows(false)
      settings.javaScriptCanOpenWindowsAutomatically = false
      settings.allowFileAccess = true
      settings.userAgentString =
        settings.userAgentString + " PeiaiAndroidShell/" + BuildConfig.VERSION_NAME

      CookieManager.getInstance().setAcceptCookie(true)
      CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

      addJavascriptInterface(ShellBridge(), JS_BRIDGE)

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
          injectShellInsetsJs()
        }

        override fun onPageFinished(view: WebView?, url: String?) {
          super.onPageFinished(view, url)
          if (!url.isNullOrBlank() && !url.startsWith("data:")) {
            lastGoodUrl = url
          }
          injectShellInsetsJs()
        }

        override fun onReceivedError(
          view: WebView?,
          request: WebResourceRequest?,
          error: WebResourceError?,
        ) {
          super.onReceivedError(view, request, error)
          if (request?.isForMainFrame == true) {
            showErrorPage(request.url?.toString())
          }
        }

        @Deprecated("Deprecated in Java")
        override fun onReceivedError(
          view: WebView?,
          errorCode: Int,
          description: String?,
          failingUrl: String?,
        ) {
          super.onReceivedError(view, errorCode, description, failingUrl)
          if (!failingUrl.isNullOrBlank()) showErrorPage(failingUrl)
        }
      }

      webChromeClient = object : WebChromeClient() {
        override fun onShowFileChooser(
          webView: WebView?,
          filePathCallback: ValueCallback<Array<Uri>>?,
          fileChooserParams: FileChooserParams?,
        ): Boolean {
          this@MainWebActivity.filePathCallback?.onReceiveValue(null)
          this@MainWebActivity.filePathCallback = filePathCallback
          val intent = try {
            fileChooserParams?.createIntent()
              ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
              }
          } catch (_: Exception) {
            Intent(Intent.ACTION_GET_CONTENT).apply {
              addCategory(Intent.CATEGORY_OPENABLE)
              type = "*/*"
            }
          }
          return try {
            fileChooserLauncher.launch(intent)
            true
          } catch (_: Exception) {
            this@MainWebActivity.filePathCallback = null
            filePathCallback?.onReceiveValue(null)
            false
          }
        }

        override fun onPermissionRequest(request: PermissionRequest?) {
          if (request == null) return
          val needed = mutableListOf<String>()
          for (res in request.resources) {
            when (res) {
              PermissionRequest.RESOURCE_AUDIO_CAPTURE ->
                if (ContextCompat.checkSelfPermission(
                    this@MainWebActivity,
                    Manifest.permission.RECORD_AUDIO,
                  ) != PackageManager.PERMISSION_GRANTED
                ) {
                  needed.add(Manifest.permission.RECORD_AUDIO)
                }
              PermissionRequest.RESOURCE_VIDEO_CAPTURE ->
                if (ContextCompat.checkSelfPermission(
                    this@MainWebActivity,
                    Manifest.permission.CAMERA,
                  ) != PackageManager.PERMISSION_GRANTED
                ) {
                  needed.add(Manifest.permission.CAMERA)
                }
            }
          }
          if (needed.isEmpty()) {
            request.grant(request.resources)
          } else {
            // 先申请系统权限，再尽量 grant（用户拒绝时 Web 自行降级）
            permissionLauncher.launch(needed.toTypedArray())
            request.grant(request.resources)
          }
        }
      }

      setDownloadListener { url, _, contentDisposition, mimeType, _ ->
        if (looksLikeApk(url, contentDisposition, mimeType)) {
          startApkDownload(url)
        } else {
          // 其它下载用系统浏览器 / 下载器处理
          try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
          } catch (_: ActivityNotFoundException) {
            toast("无法打开下载链接")
          }
        }
      }
    }

    setContentView(webView)
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
      )
      updateShellInsets(bars.top, bars.right, bars.bottom, bars.left)
      insets
    }
    ViewCompat.requestApplyInsets(webView)

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
    lastGoodUrl = startUrl
    if (savedInstanceState != null) {
      webView.restoreState(savedInstanceState)
    } else {
      webView.loadUrl(startUrl)
    }
  }

  private inner class ShellBridge {
    @JavascriptInterface
    fun retry() {
      runOnUiThread {
        val target = lastGoodUrl.ifBlank { DEFAULT_URL }
        if (target.startsWith("data:")) {
          webView.loadUrl(DEFAULT_URL)
        } else {
          webView.loadUrl(target)
        }
      }
    }

    @JavascriptInterface
    fun setLightStatusBars(light: Boolean) {
      runOnUiThread {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = light
        controller.isAppearanceLightNavigationBars = light
      }
    }

    @JavascriptInterface
    fun openExternal(url: String?) {
      if (url.isNullOrBlank()) return
      runOnUiThread {
        try {
          openInExternalBrowser(Uri.parse(url))
        } catch (_: Exception) {
          /* ignore */
        }
      }
    }
  }

  private fun setupEdgeToEdge() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    @Suppress("DEPRECATION")
    window.statusBarColor = Color.TRANSPARENT
    @Suppress("DEPRECATION")
    window.navigationBarColor = Color.TRANSPARENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      @Suppress("DEPRECATION")
      window.isStatusBarContrastEnforced = false
      @Suppress("DEPRECATION")
      window.isNavigationBarContrastEnforced = false
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val attrs = window.attributes
      attrs.layoutInDisplayCutoutMode =
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      window.attributes = attrs
    }
    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = true
    controller.isAppearanceLightNavigationBars = true
  }

  private fun updateShellInsets(topPx: Int, rightPx: Int, bottomPx: Int, leftPx: Int) {
    val density = resources.displayMetrics.density.coerceAtLeast(0.01f)
    shellInsetsCss[0] = topPx / density
    shellInsetsCss[1] = rightPx / density
    shellInsetsCss[2] = bottomPx / density
    shellInsetsCss[3] = leftPx / density
    injectShellInsetsJs()
  }

  private fun injectShellInsetsJs() {
    if (!::webView.isInitialized) return
    val t = formatCssPx(shellInsetsCss[0])
    val r = formatCssPx(shellInsetsCss[1])
    val b = formatCssPx(shellInsetsCss[2])
    val l = formatCssPx(shellInsetsCss[3])
    val js = """
      (function(){
        try {
          var d = document.documentElement;
          if (!d) return;
          d.style.setProperty('--shell-inset-top', '$t');
          d.style.setProperty('--shell-inset-right', '$r');
          d.style.setProperty('--shell-inset-bottom', '$b');
          d.style.setProperty('--shell-inset-left', '$l');
          d.classList.add('android-shell');
          if (document.body) document.body.classList.add('android-shell');
        } catch (e) {}
      })();
    """.trimIndent()
    webView.evaluateJavascript(js, null)
  }

  private fun formatCssPx(value: Float): String {
    val rounded = (value * 100f).toInt() / 100f
    return String.format(Locale.US, "%.2fpx", rounded)
  }

  private fun showErrorPage(failingUrl: String?) {
    if (!failingUrl.isNullOrBlank() && !failingUrl.startsWith("data:")) {
      lastGoodUrl = failingUrl
    }
    webView.loadDataWithBaseURL(
      HOST_ORIGIN,
      ERROR_HTML,
      "text/html",
      "UTF-8",
      null,
    )
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

  private fun handleNav(view: WebView?, uri: Uri): Boolean {
    val scheme = (uri.scheme ?: "").lowercase()
    if (scheme == "https" || scheme == "http") {
      if (looksLikeApk(uri.toString(), null, null) && isOwnHost(uri.host)) {
        startApkDownload(uri.toString())
        return true
      }
      if (isOwnHost(uri.host)) return false
      openInExternalBrowser(uri)
      return true
    }
    return try {
      startActivity(Intent(Intent.ACTION_VIEW, uri))
      true
    } catch (_: ActivityNotFoundException) {
      true
    }
  }

  private fun looksLikeApk(
    url: String?,
    contentDisposition: String?,
    mimeType: String?,
  ): Boolean {
    val u = (url ?: "").lowercase(Locale.US)
    val cd = (contentDisposition ?: "").lowercase(Locale.US)
    val mime = (mimeType ?: "").lowercase(Locale.US)
    if (mime.contains("android.package-archive")) return true
    if (cd.contains(".apk")) return true
    if (u.contains(".apk")) return true
    if (u.contains("biai-android") || u.contains("peiai-android")) return true
    return false
  }

  private fun startApkDownload(url: String) {
    if (downloading) {
      toast("正在下载安装包…")
      return
    }
    downloading = true
    toast("正在下载安装包…")
    io.execute {
      try {
        val dir = File(cacheDir, "apk").apply { mkdirs() }
        val outFile = File(dir, "biai-update.apk")
        if (outFile.exists()) outFile.delete()
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
          instanceFollowRedirects = true
          connectTimeout = 30_000
          readTimeout = 60_000
          setRequestProperty("User-Agent", "PeiaiAndroidShell/" + BuildConfig.VERSION_NAME)
          val cookie = CookieManager.getInstance().getCookie(url)
          if (!cookie.isNullOrBlank()) {
            setRequestProperty("Cookie", cookie)
          }
        }
        conn.connect()
        val code = conn.responseCode
        if (code !in 200..299) {
          throw IllegalStateException("HTTP $code")
        }
        conn.inputStream.use { input ->
          FileOutputStream(outFile).use { output ->
            input.copyTo(output)
          }
        }
        conn.disconnect()
        if (outFile.length() < 50_000L) {
          throw IllegalStateException("文件过小")
        }
        runOnUiThread {
          downloading = false
          promptInstall(outFile)
        }
      } catch (e: Exception) {
        runOnUiThread {
          downloading = false
          toast("下载失败，请检查网络后重试")
        }
      }
    }
  }

  private fun canInstallPackages(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      packageManager.canRequestPackageInstalls()
    } else {
      true
    }
  }

  private fun promptInstall(file: File) {
    if (!canInstallPackages() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      pendingApkFile.set(file)
      val intent = Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:$packageName"),
      )
      try {
        installPermissionLauncher.launch(intent)
        toast("请允许安装未知应用，然后返回")
      } catch (_: ActivityNotFoundException) {
        pendingApkFile.set(null)
        installApk(file)
      }
      return
    }
    installApk(file)
  }

  private fun installApk(file: File) {
    try {
      val uri = FileProvider.getUriForFile(
        this,
        getString(R.string.providerAuthority),
        file,
      )
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      startActivity(intent)
    } catch (_: Exception) {
      toast("无法打开安装界面")
    }
  }

  private fun openInExternalBrowser(uri: Uri) {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
    } catch (_: ActivityNotFoundException) {
      /* ignore */
    }
  }

  private fun toast(msg: String) {
    Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    resolveStartUrl(intent)?.let { url ->
      if (::webView.isInitialized) webView.loadUrl(url)
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
    io.shutdownNow()
    if (::webView.isInitialized) {
      (webView.parent as? ViewGroup)?.removeView(webView)
      webView.destroy()
    }
    super.onDestroy()
  }

  companion object {
    const val HOST = "2sc.prestoai.cn"
    const val HOST_ORIGIN = "https://2sc.prestoai.cn/"
    const val DEFAULT_URL = "https://2sc.prestoai.cn/"
    const val JS_BRIDGE = "PeiaiShell"

    private val ERROR_HTML = """
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{
            min-height:100vh;display:flex;align-items:center;justify-content:center;
            font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;
            background:#FFFCFA;color:#1c1c1e;padding:24px;
            padding-top:max(24px, env(safe-area-inset-top));
            padding-bottom:max(24px, env(safe-area-inset-bottom));
          }
          .box{max-width:320px;text-align:center}
          h1{font-size:18px;font-weight:600;margin-bottom:8px}
          p{font-size:14px;line-height:1.55;color:#48484a;margin-bottom:20px}
          button{
            appearance:none;border:0;border-radius:12px;padding:12px 22px;
            font-size:15px;font-weight:600;color:#fff;background:#4a6b52;width:100%;
          }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>网络不太好</h1>
          <p>页面加载失败，请检查网络后重试。</p>
          <button type="button" onclick="try{PeiaiShell.retry()}catch(e){location.reload()}">重试</button>
        </div>
      </body>
      </html>
    """.trimIndent()
  }
}
