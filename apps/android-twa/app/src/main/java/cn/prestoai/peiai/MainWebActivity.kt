package cn.prestoai.peiai

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.os.PowerManager
import android.provider.Settings
import android.util.Base64
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.URLUtil
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
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

/**
 * 彼爱安卓壳：全屏 WebView，尽量对齐站点 PWA standalone 行为。
 *
 * - 品牌开屏（红底 + 图标，对齐 iOS PWA）
 * - 边到边 + 安全区最早注入（document-start 烘焙 insets）
 * - early 注入：仅本域 display-mode / pwa-standalone（外站不注入）
 * - PeiaiShell 仅本域挂载；外链可同 WebView 打开但无 bridge
 * - 站点 APK 下载并安装、文件选择、麦/相机/通知权限
 * - 系统分享面板、DownloadManager 另存、本地 Alarm 准点提醒
 */
class MainWebActivity : AppCompatActivity() {

  private lateinit var webView: WebView

  private var shellInsetsCss = floatArrayOf(0f, 0f, 0f, 0f)
  private var lastGoodUrl: String = DEFAULT_URL
  private var downloading = false
  private var filePathCallback: ValueCallback<Array<Uri>>? = null
  private var pendingWebPermission: PermissionRequest? = null
  private val pendingApkFile = AtomicReference<File?>(null)
  /** JS Bridge 仅本域；外站必须卸掉，防任意页调用 PeiaiShell */
  private var bridgeAttached = false
  /** 冷启动开屏：首屏完成或超时后再撤 */
  private var keepSplash = true
  private val orphanTempWebViews = mutableListOf<WebView>()

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

  private val webPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
      val req = pendingWebPermission
      pendingWebPermission = null
      if (req == null) return@registerForActivityResult
      val allGranted = req.resources.all { res ->
        when (res) {
          PermissionRequest.RESOURCE_AUDIO_CAPTURE -> {
            grants[Manifest.permission.RECORD_AUDIO] == true
              || ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO,
              ) == PackageManager.PERMISSION_GRANTED
          }
          PermissionRequest.RESOURCE_VIDEO_CAPTURE -> {
            grants[Manifest.permission.CAMERA] == true
              || ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.CAMERA,
              ) == PackageManager.PERMISSION_GRANTED
          }
          else -> true
        }
      }
      if (allGranted) req.grant(req.resources)
      else {
        req.deny()
        val denied = mutableListOf<String>()
        for (res in req.resources) {
          when (res) {
            PermissionRequest.RESOURCE_AUDIO_CAPTURE -> denied.add("麦克风")
            PermissionRequest.RESOURCE_VIDEO_CAPTURE -> denied.add("相机")
          }
        }
        if (denied.isNotEmpty()) {
          toast("${denied.joinToString("、")}权限未开启，可在系统设置中允许")
          // 二次拒权后引导系统设置
          if (grants.values.any { !it }) {
            webView.postDelayed({
              try {
                startActivity(
                  Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:$packageName"),
                  ),
                )
              } catch (_: Exception) { /* ignore */ }
            }, 900)
          }
        }
      }
    }

  private val notifPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* H5 再读 Notification.permission */ }

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
    val splashScreen = installSplashScreen()
    splashScreen.setKeepOnScreenCondition { keepSplash }
    super.onCreate(savedInstanceState)
    setupEdgeToEdge()
    seedInsetsFromSystem()
    ShellNotifier.ensureChannel(this)
    // 冷启动补挂闹钟（H5 也会在偏好加载后再 sync）
    ReminderScheduler.rescheduleAll(this)

    webView = WebView(this).apply {
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      )
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.cacheMode = WebSettings.LOAD_DEFAULT
      settings.mediaPlaybackRequiresUserGesture = false
      // HTTPS 站点：禁止混合内容；第三方 Cookie 关闭（同站 Cookie 仍可用）
      settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      settings.useWideViewPort = true
      settings.loadWithOverviewMode = true
      settings.setSupportZoom(false)
      settings.builtInZoomControls = false
      settings.displayZoomControls = false
      // 支持 window.open / target=_blank，在 onCreateWindow 中接回同一 WebView（对齐 PWA 同页感）
      settings.setSupportMultipleWindows(true)
      settings.javaScriptCanOpenWindowsAutomatically = true
      settings.allowFileAccess = true
      // 避免系统「显示大小」把布局放大到与 PWA 不一致
      settings.textZoom = 100
      // H5 可解析 versionName + versionCode：PeiaiAndroidShell/1.0.9 (vc10)
      settings.userAgentString =
        settings.userAgentString +
          " PeiaiAndroidShell/" + BuildConfig.VERSION_NAME +
          " (vc" + BuildConfig.VERSION_CODE + ")"
      // 壳不提供定位；Geolocation 回调亦一律拒绝
      settings.setGeolocationEnabled(false)

      CookieManager.getInstance().setAcceptCookie(true)
      CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)

      attachShellBridge()
      installDocumentStartScripts(this)

      webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(
          view: WebView?,
          request: WebResourceRequest?,
        ): Boolean {
          val url = request?.url ?: return false
          return handleNav(url)
        }

        @Deprecated("Deprecated in Java")
        override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
          if (url.isNullOrBlank()) return false
          return handleNav(Uri.parse(url))
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
          super.onPageStarted(view, url, favicon)
          syncBridgeForUrl(url)
          if (isOwnPageUrl(url)) injectShellChromeJs()
        }

        override fun onPageFinished(view: WebView?, url: String?) {
          super.onPageFinished(view, url)
          syncBridgeForUrl(url)
          if (!url.isNullOrBlank() && !url.startsWith("data:") && isOwnPageUrl(url)) {
            lastGoodUrl = url
          }
          if (isOwnPageUrl(url)) {
            injectShellChromeJs()
            dismissSplash()
          }
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
        override fun onCreateWindow(
          view: WebView?,
          isDialog: Boolean,
          isUserGesture: Boolean,
          resultMsg: Message?,
        ): Boolean {
          // 把多窗口导航接回主 WebView，并销毁临时 WebView，避免泄漏
          val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
          val temp = WebView(this@MainWebActivity)
          orphanTempWebViews.add(temp)
          temp.settings.javaScriptEnabled = true
          temp.webViewClient = object : WebViewClient() {
            private fun handoff(u: Uri) {
              if (!handleNav(u)) {
                webView.loadUrl(u.toString())
              }
              destroyTempWebView(temp)
            }

            override fun shouldOverrideUrlLoading(
              v: WebView?,
              request: WebResourceRequest?,
            ): Boolean {
              val u = request?.url ?: return true
              handoff(u)
              return true
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(v: WebView?, url: String?): Boolean {
              if (url.isNullOrBlank()) return true
              handoff(Uri.parse(url))
              return true
            }
          }
          transport.webView = temp
          resultMsg.sendToTarget()
          // 兜底：未触发导航也回收
          webView.postDelayed({ destroyTempWebView(temp) }, 8_000L)
          return true
        }

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
          runOnUiThread {
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
              pendingWebPermission?.deny()
              pendingWebPermission = request
              webPermissionLauncher.launch(needed.toTypedArray())
            }
          }
        }

        override fun onGeolocationPermissionsShowPrompt(
          origin: String?,
          callback: GeolocationPermissions.Callback?,
        ) {
          // 读经壳不申请定位权限；拒绝避免空放行或未声明权限的不确定行为
          callback?.invoke(origin, false, false)
        }
      }

      setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
        if (looksLikeApk(url, contentDisposition, mimeType)) {
          startApkDownload(url)
        } else if (!url.isNullOrBlank()) {
          enqueueSystemDownload(
            url = url,
            userAgent = userAgent,
            contentDisposition = contentDisposition,
            mimeType = mimeType,
          )
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
          if (!::webView.isInitialized || !isOwnPageUrl(webView.url)) {
            finishAffinity()
            return
          }
          // 发现二级页（私信/群聊等）：交给 H5 回消息列表，避免 WebView 历史乱跳
          webView.evaluateJavascript(SHELL_BACK_JS) { result ->
            val handled = result != null && result.contains("ok")
            if (handled) return@evaluateJavascript
            runOnUiThread {
              if (webView.canGoBack()) {
                webView.goBack()
              } else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
                isEnabled = true
              }
            }
          }
        }
      },
    )

    val startUrl = resolveStartUrl(intent) ?: DEFAULT_URL
    lastGoodUrl = startUrl
    if (savedInstanceState != null) {
      webView.restoreState(savedInstanceState)
      dismissSplash()
    } else {
      webView.loadUrl(startUrl)
    }
    // 兜底：弱网也不永久挡住开屏
    webView.postDelayed({ dismissSplash() }, SPLASH_MAX_MS)
  }

  /**
   * 文档最早阶段注入：伪装 display-mode、挂 pwa-standalone，并烘焙当前安全区。
   * 仅本域，避免外站被注入壳语义。
   */
  private fun installDocumentStartScripts(target: WebView) {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
    WebViewCompat.addDocumentStartJavaScript(
      target,
      buildDocumentStartJs(),
      setOf(HOST_ORIGIN.trimEnd('/')),
    )
  }

  /** 冷启动时系统资源估算 insets，避免首帧 --shell-inset 仍为 0 */
  private fun seedInsetsFromSystem() {
    val density = resources.displayMetrics.density.coerceAtLeast(0.01f)
    val root = ViewCompat.getRootWindowInsets(window.decorView)
    if (root != null) {
      val bars = root.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
      )
      shellInsetsCss[0] = bars.top / density
      shellInsetsCss[1] = bars.right / density
      shellInsetsCss[2] = bars.bottom / density
      shellInsetsCss[3] = bars.left / density
      return
    }
    fun sysDimenDp(name: String, fallbackDp: Float): Float {
      val id = resources.getIdentifier(name, "dimen", "android")
      val px = if (id > 0) resources.getDimensionPixelSize(id) else (fallbackDp * density).toInt()
      return px / density
    }
    shellInsetsCss[0] = sysDimenDp("status_bar_height", 28f)
    shellInsetsCss[1] = 0f
    shellInsetsCss[2] = sysDimenDp("navigation_bar_height", 24f)
    shellInsetsCss[3] = 0f
  }

  private fun dismissSplash() {
    keepSplash = false
  }

  private fun buildDocumentStartJs(): String {
    val t = formatCssPx(shellInsetsCss[0])
    val r = formatCssPx(shellInsetsCss[1])
    val b = formatCssPx(shellInsetsCss[2])
    val l = formatCssPx(shellInsetsCss[3])
    return """
      (function(){
        try {
          var ORIG = window.matchMedia.bind(window);
          window.matchMedia = function(q) {
            try {
              if (typeof q === 'string' && /display-mode\s*:\s*(standalone|fullscreen|minimal-ui)/i.test(q)) {
                return {
                  matches: true,
                  media: q,
                  onchange: null,
                  addListener: function(){},
                  removeListener: function(){},
                  addEventListener: function(){},
                  removeEventListener: function(){},
                  dispatchEvent: function(){ return false; }
                };
              }
            } catch (e) {}
            return ORIG(q);
          };
          var d = document.documentElement;
          if (d) {
            d.classList.add('android-shell', 'pwa-standalone');
            d.style.setProperty('--shell-inset-top', '$t');
            d.style.setProperty('--shell-inset-right', '$r');
            d.style.setProperty('--shell-inset-bottom', '$b');
            d.style.setProperty('--shell-inset-left', '$l');
          }
        } catch (e) {}
      })();
    """.trimIndent()
  }

  private fun isOwnPageUrl(url: String?): Boolean {
    if (url.isNullOrBlank() || url.startsWith("data:")) return false
    return try {
      isOwnHost(Uri.parse(url).host)
    } catch (_: Exception) {
      false
    }
  }

  private fun syncBridgeForUrl(url: String?) {
    if (isOwnPageUrl(url)) attachShellBridge()
    else detachShellBridge()
  }

  private fun attachShellBridge() {
    if (!::webView.isInitialized || bridgeAttached) return
    webView.addJavascriptInterface(ShellBridge(), JS_BRIDGE)
    bridgeAttached = true
  }

  private fun detachShellBridge() {
    if (!::webView.isInitialized || !bridgeAttached) return
    try {
      webView.removeJavascriptInterface(JS_BRIDGE)
    } catch (_: Exception) {
      /* ignore */
    }
    bridgeAttached = false
  }

  private fun destroyTempWebView(temp: WebView) {
    if (!orphanTempWebViews.remove(temp)) return
    try {
      (temp.parent as? ViewGroup)?.removeView(temp)
      temp.stopLoading()
      temp.loadUrl("about:blank")
      temp.webViewClient = WebViewClient()
      temp.destroy()
    } catch (_: Exception) {
      /* ignore */
    }
  }

  /**
   * 回到前台：仅催 SW 更新 + 派发 peiai-shell-resume（StaleShellGuard 探测）。
   * 不再硬刷整页，避免首页态（滚动/表单/弹层）被清空。
   */
  private fun onShellForeground() {
    if (!::webView.isInitialized) return
    val url = webView.url
    if (!isOwnPageUrl(url)) return
    webView.evaluateJavascript(RESUME_REFRESH_JS, null)
  }

  private inner class ShellBridge {
    @JavascriptInterface
    fun retry() {
      runOnUiThread {
        val target = lastGoodUrl.ifBlank { DEFAULT_URL }
        if (target.startsWith("data:")) webView.loadUrl(DEFAULT_URL)
        else webView.loadUrl(target)
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

    /**
     * 系统栏底色。默认 edge-to-edge 为透明，与 iOS PWA 内容下沉一致；
     * 支持 #RGB / #RRGGBB / #AARRGGBB（H5 传 #00000000 可复位透明）。
     */
    @JavascriptInterface
    fun setStatusBarColor(colorHex: String?) {
      if (colorHex.isNullOrBlank()) return
      runOnUiThread {
        try {
          val raw = colorHex.trim()
          val c = Color.parseColor(raw)
          @Suppress("DEPRECATION")
          window.statusBarColor = c
          @Suppress("DEPRECATION")
          // 导航栏保持透明，让浮动 Tab 下透出页面底（对齐 iOS home indicator 区域）
          if (Color.alpha(c) == 0) {
            window.navigationBarColor = Color.TRANSPARENT
          } else {
            window.navigationBarColor = c
          }
        } catch (_: Exception) {
          /* ignore bad color */
        }
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

    /** Android 13+：在用户打开提醒等时由 H5 调用 */
    @JavascriptInterface
    fun requestNotifications() {
      runOnUiThread {
        if (Build.VERSION.SDK_INT < 33) return@runOnUiThread
        if (
          ContextCompat.checkSelfPermission(
            this@MainWebActivity,
            Manifest.permission.POST_NOTIFICATIONS,
          ) == PackageManager.PERMISSION_GRANTED
        ) {
          return@runOnUiThread
        }
        notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
      }
    }

    /**
     * 即时社交/摘要通知（进程存活时由 H5 调用）。
     * @return "ok" | "denied" | "fail"
     */
    @JavascriptInterface
    fun showNotification(
      title: String?,
      body: String?,
      openPath: String?,
      tag: String?,
    ): String {
      if (Build.VERSION.SDK_INT >= 33) {
        val granted = ContextCompat.checkSelfPermission(
          this@MainWebActivity,
          Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
          runOnUiThread { requestNotificationsIfNeeded() }
          return "denied"
        }
      }
      return try {
        val ok = ShellNotifier.showSocial(
          this@MainWebActivity,
          title = title?.trim().orEmpty(),
          body = body?.trim().orEmpty(),
          openPath = openPath?.trim().orEmpty().ifBlank { "/discover" },
          tag = tag?.trim(),
        )
        if (ok) "ok" else "fail"
      } catch (_: Exception) {
        "fail"
      }
    }

    @JavascriptInterface
    fun hasNotificationBridge(): Boolean = true

    /**
     * 系统分享面板（可选 data URL / base64 图片）。
     * imageDataUrl: `data:image/png;base64,...` 或空。
     */
    @JavascriptInterface
    fun share(title: String?, text: String?, url: String?, imageDataUrl: String?) {
      runOnUiThread {
        try {
          shareOutbound(
            title = title?.trim().orEmpty(),
            text = text?.trim().orEmpty(),
            url = url?.trim().orEmpty(),
            imageDataUrl = imageDataUrl?.trim().orEmpty(),
          )
        } catch (_: Exception) {
          toast("暂时无法打开分享")
        }
      }
    }

    /**
     * 本地准点提醒。kind: daily | group
     * enabled 用 0/1，避免部分 WebView boolean 桥接问题。
     */
    @JavascriptInterface
    fun scheduleReminder(
      kind: String?,
      enabled: Int,
      hour: Int,
      minute: Int,
      title: String?,
      body: String?,
      openPath: String?,
    ) {
      val k = when (kind?.trim()?.lowercase(Locale.US)) {
        ReminderScheduler.KIND_GROUP, "group_evening", "group-evening" ->
          ReminderScheduler.KIND_GROUP
        else -> ReminderScheduler.KIND_DAILY
      }
      ReminderScheduler.schedule(
        this@MainWebActivity,
        kind = k,
        enabled = enabled != 0,
        hour = hour,
        minute = minute,
        title = title ?: "",
        body = body ?: "",
        openPath = openPath ?: if (k == ReminderScheduler.KIND_GROUP) "/discover" else "/",
      )
      if (enabled != 0) {
        runOnUiThread { requestNotificationsIfNeeded() }
      }
    }

    @JavascriptInterface
    fun cancelReminder(kind: String?) {
      val k = when (kind?.trim()?.lowercase(Locale.US)) {
        ReminderScheduler.KIND_GROUP, "group_evening", "group-evening" ->
          ReminderScheduler.KIND_GROUP
        else -> ReminderScheduler.KIND_DAILY
      }
      ReminderScheduler.cancel(this@MainWebActivity, k)
    }

    /** 拒权后引导用户去系统设置 */
    @JavascriptInterface
    fun openAppSettings() {
      runOnUiThread {
        try {
          val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:$packageName"),
          )
          startActivity(intent)
        } catch (_: Exception) {
          try {
            startActivity(Intent(Settings.ACTION_SETTINGS))
          } catch (_: Exception) {
            toast("请到系统设置中找到「彼爱」")
          }
        }
      }
    }

    /** 精确闹钟权限设置（Android 12+ 部分机型） */
    @JavascriptInterface
    fun openExactAlarmSettings() {
      runOnUiThread {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@runOnUiThread
        try {
          startActivity(
            Intent(
              Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
              Uri.parse("package:$packageName"),
            ),
          )
        } catch (_: Exception) {
          openAppSettings()
        }
      }
    }

    /**
     * 用系统 DownloadManager 另存到「下载」目录（非 APK）。
     * @return "ok" | "fail"
     */
    @JavascriptInterface
    fun downloadUrl(url: String?, fileName: String?): String {
      if (url.isNullOrBlank()) return "fail"
      return try {
        enqueueSystemDownload(
          url = url,
          userAgent = null,
          contentDisposition = null,
          mimeType = null,
          preferredName = fileName,
        )
        "ok"
      } catch (_: Exception) {
        "fail"
      }
    }

    /** 是否具备原生分享桥（H5 探测用，恒为 true） */
    @JavascriptInterface
    fun hasShareBridge(): Boolean = true

    /** 是否具备本地闹钟桥 */
    @JavascriptInterface
    fun hasReminderBridge(): Boolean = true

    /** 壳 versionName（与 UA / BuildConfig 一致） */
    @JavascriptInterface
    fun getVersionName(): String = BuildConfig.VERSION_NAME

    /** 壳 versionCode；H5 优先用此判断更新，避免只 bump code 时漏提示 */
    @JavascriptInterface
    fun getVersionCode(): Int = BuildConfig.VERSION_CODE

    /**
     * 清 WebView HTTP 磁盘/内存缓存（不动 Cookie/localStorage）。
     * H5 应用内「清除缓存」在卸 SW 前调用，否则只清 Cache API 仍会命中系统 HTTP 缓存。
     * @return "ok"
     */
    @JavascriptInterface
    fun clearWebViewCache(): String {
      runOnUiThread {
        try {
          if (::webView.isInitialized) {
            webView.clearCache(true)
            webView.clearFormData()
          }
        } catch (_: Exception) {
          /* ignore */
        }
      }
      return "ok"
    }

    /**
     * 清 HTTP 缓存后从官网首页硬进（带 _nc），绕开 SW/系统缓存旧壳。
     * 比 location.reload 更彻底；完成后 15s 内 LOAD_NO_CACHE。
     * @return "ok"
     */
    @JavascriptInterface
    fun hardReloadFromOrigin(): String {
      runOnUiThread {
        try {
          if (!::webView.isInitialized) return@runOnUiThread
          webView.clearCache(true)
          webView.clearFormData()
          webView.settings.cacheMode = WebSettings.LOAD_NO_CACHE
          val bust = System.currentTimeMillis()
          webView.loadUrl("${DEFAULT_URL}?_nc=$bust")
          lastGoodUrl = DEFAULT_URL
          webView.postDelayed({
            try {
              if (::webView.isInitialized) {
                webView.settings.cacheMode = WebSettings.LOAD_DEFAULT
              }
            } catch (_: Exception) {
              /* ignore */
            }
          }, 15_000L)
        } catch (_: Exception) {
          /* ignore */
        }
      }
      return "ok"
    }

    /** 是否已忽略电池优化（提醒准点相关） */
    @JavascriptInterface
    fun isBatteryOptimizationExempt(): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
      return try {
        val pm = getSystemService(PowerManager::class.java) ?: return true
        pm.isIgnoringBatteryOptimizations(packageName)
      } catch (_: Exception) {
        true
      }
    }

    /** 引导关闭电池优化；失败则打开应用详情 */
    @JavascriptInterface
    fun openBatteryOptimizationSettings() {
      runOnUiThread {
        try {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            startActivity(
              Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:$packageName"),
              ),
            )
            return@runOnUiThread
          }
        } catch (_: Exception) {
          /* fallthrough */
        }
        try {
          startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        } catch (_: Exception) {
          openAppSettings()
        }
      }
    }
  }

  private fun requestNotificationsIfNeeded() {
    if (Build.VERSION.SDK_INT < 33) return
    if (
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
      == PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
  }

  private fun shareOutbound(title: String, text: String, url: String, imageDataUrl: String) {
    val body = buildString {
      if (text.isNotBlank()) append(text)
      if (url.isNotBlank()) {
        if (isNotEmpty()) append('\n')
        append(url)
      }
    }
    val imageUri = writeShareImageIfNeeded(imageDataUrl)
    val send = Intent(Intent.ACTION_SEND).apply {
      if (imageUri != null) {
        type = "image/*"
        putExtra(Intent.EXTRA_STREAM, imageUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = android.content.ClipData.newUri(contentResolver, "share", imageUri)
        if (body.isNotBlank()) putExtra(Intent.EXTRA_TEXT, body)
        if (title.isNotBlank()) putExtra(Intent.EXTRA_SUBJECT, title)
      } else {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, body.ifBlank { title.ifBlank { HOST_ORIGIN } })
        if (title.isNotBlank()) putExtra(Intent.EXTRA_SUBJECT, title)
      }
    }
    val chooser = Intent.createChooser(send, if (title.isNotBlank()) title else "分享到")
    try {
      startActivity(chooser)
    } catch (_: ActivityNotFoundException) {
      toast("没有可用的分享应用")
    }
  }

  private fun writeShareImageIfNeeded(imageDataUrl: String): Uri? {
    if (imageDataUrl.isBlank()) return null
    return try {
      val comma = imageDataUrl.indexOf(',')
      val raw = if (imageDataUrl.startsWith("data:", ignoreCase = true) && comma > 0) {
        imageDataUrl.substring(comma + 1)
      } else {
        imageDataUrl
      }
      val bytes = Base64.decode(raw, Base64.DEFAULT)
      if (bytes.isEmpty() || bytes.size > 12 * 1024 * 1024) return null
      val dir = File(cacheDir, "share").apply { mkdirs() }
      val ext = when {
        imageDataUrl.contains("image/jpeg") || imageDataUrl.contains("image/jpg") -> "jpg"
        imageDataUrl.contains("image/webp") -> "webp"
        else -> "png"
      }
      val out = File(dir, "share-${System.currentTimeMillis()}.$ext")
      FileOutputStream(out).use { it.write(bytes) }
      FileProvider.getUriForFile(this, getString(R.string.providerAuthority), out)
    } catch (_: Exception) {
      null
    }
  }

  private fun enqueueSystemDownload(
    url: String,
    userAgent: String?,
    contentDisposition: String?,
    mimeType: String?,
    preferredName: String? = null,
  ) {
    try {
      val name = preferredName?.takeIf { it.isNotBlank() }
        ?: URLUtil.guessFileName(url, contentDisposition, mimeType)
      val request = DownloadManager.Request(Uri.parse(url)).apply {
        setTitle(name)
        setDescription("彼爱下载")
        setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
        if (!mimeType.isNullOrBlank()) setMimeType(mimeType)
        val cookie = CookieManager.getInstance().getCookie(url)
        if (!cookie.isNullOrBlank()) addRequestHeader("Cookie", cookie)
        val ua = userAgent ?: ("PeiaiAndroidShell/" + BuildConfig.VERSION_NAME)
        addRequestHeader("User-Agent", ua)
        @Suppress("DEPRECATION")
        allowScanningByMediaScanner()
      }
      val dm = getSystemService(DownloadManager::class.java)
      dm?.enqueue(request)
      toast("已加入下载：$name")
    } catch (_: Exception) {
      try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
      } catch (_: ActivityNotFoundException) {
        toast("无法下载此文件")
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
    injectShellChromeJs()
  }

  /** 安全区 + PWA 类标记（document-start 之后仍刷新，保证 body 也有类） */
  private fun injectShellChromeJs() {
    if (!::webView.isInitialized) return
    if (!isOwnPageUrl(webView.url) && !isOwnPageUrl(lastGoodUrl)) return
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
          d.classList.add('android-shell', 'pwa-standalone');
          if (document.body) {
            document.body.classList.add('android-shell', 'pwa-standalone');
          }
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
    dismissSplash()
    if (!failingUrl.isNullOrBlank() && !failingUrl.startsWith("data:")) {
      lastGoodUrl = failingUrl
    }
    webView.loadDataWithBaseURL(HOST_ORIGIN, ERROR_HTML, "text/html", "UTF-8", null)
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
   * @return true = 已拦截；false = WebView 默认加载（保持与 PWA 同 WebView 导航）
   */
  private fun handleNav(uri: Uri): Boolean {
    val scheme = (uri.scheme ?: "").lowercase()
    if (scheme == "https" || scheme == "http") {
      // 本站 APK 走壳内安装；其余 http(s)（含外链）均在 WebView 内打开，对齐 pwa_nav
      if (looksLikeApk(uri.toString(), null, null)) {
        startApkDownload(uri.toString())
        return true
      }
      return false
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
          if (!cookie.isNullOrBlank()) setRequestProperty("Cookie", cookie)
        }
        conn.connect()
        val code = conn.responseCode
        if (code !in 200..299) throw IllegalStateException("HTTP $code")
        conn.inputStream.use { input ->
          FileOutputStream(outFile).use { output -> input.copyTo(output) }
        }
        conn.disconnect()
        if (outFile.length() < 50_000L) throw IllegalStateException("文件过小")
        runOnUiThread {
          downloading = false
          promptInstall(outFile)
        }
      } catch (_: Exception) {
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
    } else true
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
      navigateOwnUrl(url)
    }
  }

  /**
   * 本域深链：已加载同源页时派发 peiai-shell-navigate（SPA），避免 loadUrl 冲掉 KeepAlive/IM。
   * 冷启动 / 非本域 / 桥未就绪 → 仍 loadUrl。
   */
  private fun navigateOwnUrl(url: String) {
    if (!::webView.isInitialized) return
    if (!isOwnPageUrl(url)) {
      openInExternalBrowser(Uri.parse(url))
      return
    }
    val current = webView.url
    if (!isOwnPageUrl(current)) {
      webView.loadUrl(url)
      return
    }
    val quoted = org.json.JSONObject.quote(url)
    val js = """
      (function(){
        try {
          var u = $quoted;
          var path = u;
          try {
            var a = document.createElement('a');
            a.href = u;
            path = (a.pathname || '/') + (a.search || '') + (a.hash || '');
          } catch (e) {}
          if (window.__peiaiShellNavReady) {
            window.dispatchEvent(new CustomEvent('peiai-shell-navigate', {
              detail: { href: path, url: u }
            }));
            return 'ok';
          }
          return 'fallback';
        } catch (e) { return 'fallback'; }
      })();
    """.trimIndent()
    webView.evaluateJavascript(js) { result ->
      val ok = result != null && result.contains("ok")
      if (!ok) {
        runOnUiThread { webView.loadUrl(url) }
      }
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
    onShellForeground()
  }

  override fun onDestroy() {
    io.shutdownNow()
    ArrayList(orphanTempWebViews).forEach { destroyTempWebView(it) }
    orphanTempWebViews.clear()
    if (::webView.isInitialized) {
      detachShellBridge()
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
    /** 开屏最长停留，避免弱网永久挡住 */
    private const val SPLASH_MAX_MS = 4_000L

    private val RESUME_REFRESH_JS = """
      (function(){
        try {
          if (navigator.serviceWorker) {
            navigator.serviceWorker.getRegistration().then(function(r){
              if (r) r.update();
            });
          }
          window.dispatchEvent(new Event('peiai-shell-resume'));
        } catch (e) {}
      })();
    """.trimIndent()

    /** 发现二级页系统返回：H5 __peiaiShellBack → /discover */
    private val SHELL_BACK_JS = """
      (function(){
        try {
          if (typeof window.__peiaiShellBack === 'function' && window.__peiaiShellBack()) {
            return 'ok';
          }
          return '';
        } catch (e) { return ''; }
      })();
    """.trimIndent()

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
            padding-top:max(24px, env(safe-area-inset-top, 0px));
            padding-bottom:max(24px, env(safe-area-inset-bottom, 0px));
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
