package cn.prestoai.peiai

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.setPadding

/** 无可用 Chrome / Custom Tabs provider 时的诚实降级页（不回落 WebView）。 */
class ChromeMissingActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val density = resources.displayMetrics.density
    val pad = (24 * density).toInt()

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(pad)
      setBackgroundColor(0xFFFFFCFA.toInt())
    }
    val title = TextView(this).apply {
      text = "需要 Chrome"
      textSize = 22f
      setTextColor(0xFF1A1A1A.toInt())
    }
    val body = TextView(this).apply {
      text = getString(R.string.chromeRequired) +
        "\n\n彼爱安卓安装包使用 Chrome 打开官网，以对齐 iOS 主屏幕体验。安装 Chrome 后重新打开桌面「彼爱」即可。"
      textSize = 15f
      setTextColor(0xFF444444.toInt())
      setPadding(0, (12 * density).toInt(), 0, (20 * density).toInt())
    }
    val btn = Button(this).apply {
      text = "安装 Chrome"
      setOnClickListener {
        try {
          startActivity(
            Intent(
              Intent.ACTION_VIEW,
              Uri.parse("market://details?id=com.android.chrome"),
            ),
          )
        } catch (_: Exception) {
          startActivity(
            Intent(
              Intent.ACTION_VIEW,
              Uri.parse("https://play.google.com/store/apps/details?id=com.android.chrome"),
            ),
          )
        }
      }
    }
    val openWeb = Button(this).apply {
      text = "用浏览器打开官网"
      setOnClickListener {
        startActivity(
          Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.DEFAULT_URL)),
        )
      }
    }
    root.addView(title)
    root.addView(body)
    root.addView(btn)
    root.addView(openWeb)
    setContentView(root)
  }
}
