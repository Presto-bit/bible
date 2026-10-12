#!/usr/bin/env bash
# 检查全量 release（R8 + shrinkResources）所需 Maven 缓存是否齐全。
# 用法：./scripts/verify_android_release_cache.sh
# 通过 ≠ 保证 assembleRelease 一定成功，但可排除「离线缺构件」类假死。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
_ANDROID_ENV_ROOT="$ROOT"
# shellcheck source=scripts/_android_build_env.sh
source "$ROOT/scripts/_android_build_env.sh"

MOBILE="$ROOT/apps/mobile"
GH="$GRADLE_USER_HOME"
missing=0

_check_jar() {
  local label="$1"
  local path="$2"
  if [[ -f "$path" ]]; then
    echo "  OK  $label"
  else
    echo "  MISS $label"
    missing=1
  fi
}

echo "Gradle cache: $GH"
echo "Required Maven artifacts (AGP 8.11.1 + desugar):"
_check_jar "gradle-8.11.1.jar" \
  "$GH/caches/modules-2/files-2.1/com.android.tools.build/gradle/8.11.1"/*/gradle-8.11.1.jar
_check_jar "builder-8.11.1.jar (含 R8)" \
  "$GH/caches/modules-2/files-2.1/com.android.tools.build/builder/8.11.1"/*/builder-8.11.1.jar
_check_jar "desugar_jdk_libs-2.1.4.jar" \
  "$GH/caches/modules-2/files-2.1/com.android.tools/desugar_jdk_libs/2.1.4"/*/desugar_jdk_libs-2.1.4.jar

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
if [[ -d "$MOBILE/.android-sdk-shim/platforms/android-35" ]]; then
  SDK="$MOBILE/.android-sdk-shim"
fi
echo "Android SDK (compile): $SDK"
for p in android-35 android-36; do
  if [[ -d "$SDK/platforms/$p" ]]; then
    echo "  OK  platforms/$p"
  else
    echo "  MISS platforms/$p"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo ""
  echo "有缺失：请先在线执行一次 ORG_GRADLE_OFFLINE=0 ./scripts/publish_flutter_apk.sh 或 Android Studio Sync。"
  exit 1
fi

echo ""
echo "Offline dry-run :app:assembleRelease …"
(cd "$MOBILE/android" && env GRADLE_USER_HOME="$GH" GRADLE_OPTS='-Dorg.gradle.offline=true' \
  ./gradlew :app:assembleRelease --dry-run -q) && echo "Dry-run OK — 缓存可满足离线解析；R8 执行仍可能需 15–40 分钟。"
