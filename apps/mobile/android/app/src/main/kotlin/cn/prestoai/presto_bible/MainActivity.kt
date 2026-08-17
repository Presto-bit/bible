package cn.prestoai.presto_bible

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterFragmentActivity() {
  private val updateChannel = "cn.prestoai.peiai/app_update"
  private val permissionChannel = "cn.prestoai.peiai/permissions"
  private var pendingApk: File? = null
  private var pendingMicResult: MethodChannel.Result? = null

  private val installPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
      val apk = pendingApk ?: return@registerForActivityResult
      if (canInstallPackages()) {
        pendingApk = null
        installApk(apk)
      } else {
        toast("请允许彼爱安装未知应用后，再试一次")
      }
    }

  private val micPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      pendingMicResult?.success(granted)
      pendingMicResult = null
    }

  override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)
    MethodChannel(flutterEngine.dartExecutor.binaryMessenger, updateChannel)
      .setMethodCallHandler { call, result ->
        when (call.method) {
          "versionInfo" -> {
            @Suppress("DEPRECATION")
            val info = packageManager.getPackageInfo(packageName, 0)
            val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
              info.longVersionCode.toInt()
            } else {
              @Suppress("DEPRECATION")
              info.versionCode
            }
            result.success(
              mapOf(
                "versionName" to (info.versionName ?: ""),
                "versionCode" to versionCode,
              ),
            )
          }
          "promptInstall" -> {
            val path = call.argument<String>("path")
            val apk = path?.let(::File)
            if (apk == null || !apk.isFile || apk.length() < 50 * 1024) {
              result.error("invalid_apk", "安装包无效", null)
            } else {
              promptInstall(apk)
              result.success(null)
            }
          }
          "openExternal" -> {
            val url = call.argument<String>("url")?.trim().orEmpty()
            if (url.isEmpty) {
              result.error("invalid_url", "链接无效", null)
            } else {
              try {
                startActivity(
                  Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                  },
                )
                result.success(null)
              } catch (_: ActivityNotFoundException) {
                result.error("no_browser", "未找到可用浏览器", null)
              } catch (e: Exception) {
                result.error("open_failed", e.message, null)
              }
            }
          }
          else -> result.notImplemented()
        }
      }

    MethodChannel(flutterEngine.dartExecutor.binaryMessenger, permissionChannel)
      .setMethodCallHandler { call, result ->
        when (call.method) {
          "hasMicrophone" -> result.success(hasMicrophonePermission())
          "requestMicrophone" -> requestMicrophonePermission(result)
          else -> result.notImplemented()
        }
      }
  }

  private fun hasMicrophonePermission(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED

  private fun requestMicrophonePermission(result: MethodChannel.Result) {
    if (hasMicrophonePermission()) {
      result.success(true)
      return
    }
    if (pendingMicResult != null) {
      result.error("busy", "已有权限请求进行中", null)
      return
    }
    pendingMicResult = result
    micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
  }

  private fun canInstallPackages(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()

  private fun promptInstall(apk: File) {
    if (!canInstallPackages() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      pendingApk = apk
      try {
        installPermissionLauncher.launch(
          Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:$packageName"),
          ),
        )
        toast("请允许彼爱安装未知应用，然后返回")
      } catch (_: ActivityNotFoundException) {
        toast("无法打开安装权限设置")
      }
      return
    }
    installApk(apk)
  }

  private fun installApk(apk: File) {
    try {
      val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", apk)
      startActivity(
        Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        },
      )
    } catch (_: Exception) {
      toast("无法打开安装提示")
    }
  }

  private fun toast(message: String) {
    Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
  }
}
