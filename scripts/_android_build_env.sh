#!/usr/bin/env bash
# 安卓打包公共环境：Flutter 路径、Gradle 缓存、国内镜像、Daemon 清理。
# 由 publish_flutter_apk.sh / build_flutter_apk_dev.sh source。
set -euo pipefail

_android_env_root="${_ANDROID_ENV_ROOT:?set _ANDROID_ENV_ROOT before source}"

MOBILE="$_android_env_root/apps/mobile"
GRADLE_USER_HOME="${GRADLE_USER_HOME:-$_android_env_root/.gradle-home}"
export GRADLE_USER_HOME

FLUTTER="${FLUTTER_BIN:-flutter}"
if ! command -v "$FLUTTER" >/dev/null 2>&1; then
  for cand in \
    "$HOME/development/flutter/bin/flutter" \
    /opt/homebrew/bin/flutter \
    "$HOME/flutter/bin/flutter"; do
    if [[ -x "$cand" ]]; then FLUTTER="$cand"; break; fi
  done
fi
if ! command -v "$FLUTTER" >/dev/null 2>&1 && [[ ! -x "$FLUTTER" ]]; then
  echo "flutter not found; set FLUTTER_BIN" >&2
  exit 1
fi

if [[ -d "$MOBILE/.android-sdk-shim/platforms/android-35" ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-$MOBILE/.android-sdk-shim}"
  export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
fi

# 阿里 Maven 镜像：Flutter composite :gradle 也会加载（init.d 自动执行）
CHINA_MIRROR_INIT="$MOBILE/android/gradle/china-mirror.init.gradle"
CHINA_MIRROR_DEST="$GRADLE_USER_HOME/init.d/china-mirror.gradle"
mkdir -p "$GRADLE_USER_HOME/init.d"
if [[ ! -f "$CHINA_MIRROR_DEST" ]] || ! cmp -s "$CHINA_MIRROR_INIT" "$CHINA_MIRROR_DEST"; then
  cp "$CHINA_MIRROR_INIT" "$CHINA_MIRROR_DEST"
fi

# Gradle 9.1 bin：优先复用本机 ~/.gradle 已下载包，避免重复拉取
_gradle_bin_id="a7zz1zpvyl3jaouarz82m4yky"
_gradle_dest="$GRADLE_USER_HOME/wrapper/dists/gradle-9.1.0-bin/$_gradle_bin_id"
_gradle_src="$HOME/.gradle/wrapper/dists/gradle-9.1.0-bin/$_gradle_bin_id"
if [[ ! -f "$_gradle_dest/gradle-9.1.0-bin.zip.ok" && -f "$_gradle_src/gradle-9.1.0-bin.zip.ok" ]]; then
  echo "Seeding Gradle 9.1 bin from ~/.gradle → .gradle-home"
  mkdir -p "$_gradle_dest"
  cp -R "$_gradle_src/"* "$_gradle_dest/"
fi

# 仅当 buildLogic 锁存在时停 Daemon（并行 Android Studio 同步 + CLI 打包会抢锁）
_gradle_lock="$MOBILE/android/.gradle/noVersion/buildLogic.lock"
if [[ -f "$_gradle_lock" ]]; then
  echo "Gradle lock detected, stopping project daemons…"
  (cd "$MOBILE/android" && ./gradlew --stop >/dev/null 2>&1) || true
fi

# 依赖已在 .gradle-home 时默认离线，跳过 dl.google.com
_android_deps_cached() {
  [[ -n "$(find "$GRADLE_USER_HOME/caches/modules-2/files-2.1/com.android.tools.build/gradle/8.11.1" -name 'gradle-8.11.1.jar' -print -quit 2>/dev/null)" ]]
}
if [[ "${ORG_GRADLE_OFFLINE:-0}" == "1" ]] || { [[ "${ORG_GRADLE_OFFLINE:-auto}" != "0" ]] && _android_deps_cached; }; then
  export GRADLE_OPTS="${GRADLE_OPTS:-} -Dorg.gradle.offline=true"
  echo "Gradle offline (cached deps in .gradle-home)"
fi

# flutter_html 3.0.0 × html≥0.15.7：qs.matches 已移除，用仓库补丁覆盖 pub-cache
android_patch_flutter_html() {
  local patch="$MOBILE/tool/flutter_html_styled_element_patch.dart"
  [[ -f "$patch" ]] || return 0
  local target
  target="$(find "${PUB_CACHE:-$HOME/.pub-cache}/hosted" -path '*/flutter_html-3.0.0/lib/src/tree/styled_element.dart' 2>/dev/null | head -1 || true)"
  if [[ -z "$target" ]]; then
    echo "flutter_html styled_element.dart not in pub-cache yet (ok until after pub get)"
    return 0
  fi
  if ! cmp -s "$patch" "$target"; then
    echo "Patching flutter_html styled_element.dart (html qs.matches compat)"
    cp "$patch" "$target"
  fi
}

# pub get 仅 lock 变更时执行
android_flutter_pub_get() {
  local stamp="$MOBILE/.dart_tool/pub_get.stamp"
  mkdir -p "$MOBILE/.dart_tool"
  if [[ ! -f "$stamp" || "$MOBILE/pubspec.yaml" -nt "$stamp" || "$MOBILE/pubspec.lock" -nt "$stamp" ]]; then
    (cd "$MOBILE" && "$FLUTTER" pub get)
    touch "$stamp"
  else
    echo "pub get skipped (lock unchanged)"
  fi
  android_patch_flutter_html
}
