package cn.prestoai.peiai

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** 同域 APK 下载并用系统安装器覆盖安装。 */
object ApkInstaller {
  private val io = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  fun downloadAndInstall(context: Context, url: String) {
    val app = context.applicationContext
    Toast.makeText(app, "正在下载更新…", Toast.LENGTH_SHORT).show()
    io.execute {
      try {
        val dir = File(app.cacheDir, "apk").apply { mkdirs() }
        val out = File(dir, "biai-android-update.apk")
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = 20_000
          readTimeout = 60_000
          instanceFollowRedirects = true
        }
        conn.inputStream.use { input ->
          FileOutputStream(out).use { fos -> input.copyTo(fos) }
        }
        conn.disconnect()
        main.post {
          if (!canInstall(app)) {
            requestInstallPermission(app)
            Toast.makeText(app, "请允许「安装未知应用」后再试", Toast.LENGTH_LONG).show()
            return@post
          }
          try {
            app.startActivity(buildInstallIntent(app, out))
          } catch (_: Exception) {
            Toast.makeText(app, "无法打开安装器", Toast.LENGTH_SHORT).show()
          }
        }
      } catch (_: Exception) {
        main.post {
          Toast.makeText(app, "下载失败，请稍后重试", Toast.LENGTH_SHORT).show()
        }
      }
    }
  }

  private fun buildInstallIntent(context: Context, file: File): Intent {
    val uri = FileProvider.getUriForFile(
      context,
      context.getString(R.string.providerAuthority),
      file,
    )
    return Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
  }

  private fun canInstall(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.packageManager.canRequestPackageInstalls()
    } else {
      true
    }
  }

  private fun requestInstallPermission(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    try {
      context.startActivity(
        Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    } catch (_: Exception) {
      /* ignore */
    }
  }
}
