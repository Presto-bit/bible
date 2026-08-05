# Flutter + 插件 R8（release minify）保留规则
# 避免反射/JNI 入口被裁掉导致 WebView、SQLite、通知等崩溃。

-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# WebView JS bridge（H5 白名单页）
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(android.webkit.WebView, java.lang.String, android.graphics.Bitmap);
    public boolean *(android.webkit.WebView, java.lang.String);
}
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public void *(android.webkit.WebView, java.lang.String);
}

# sqlite3 / Drift
-keep class com.jetradical.** { *; }
-keep class org.sqlite.** { *; }
-keep class com.github.davidmoten.** { *; }
-dontwarn org.sqlite.**

# 本地通知 / 时区
-keep class com.dexterous.** { *; }
-dontwarn com.dexterous.**

# speech_to_text / 语音（若有设备端反射）
-keep class com.csdcorp.speech_to_text.** { *; }
-dontwarn com.csdcorp.speech_to_text.**

# 安全存储
-keep class com.it_nomads.fluttersecurestorage.** { *; }

# Play Core（部分插件可选依赖，缺失时勿 fail）
-dontwarn com.google.android.play.core.**

# 通用：保留 native 方法与枚举
-keepclasseswithmembernames class * {
    native <methods>;
}
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
