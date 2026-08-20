#!/usr/bin/env bash
# 本机快速装包：debug（最快）或 fast-release（无混淆/R8）。
# 不写官网 downloads。模拟器联调优先用本脚本。
#
#   ./scripts/build_flutter_apk_dev.sh           # debug，最快
#   ./scripts/build_flutter_apk_dev.sh fast      # release 无混淆，接近真机性能
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
_ANDROID_ENV_ROOT="$ROOT"
# shellcheck source=scripts/_android_build_env.sh
source "$ROOT/scripts/_android_build_env.sh"

MOBILE="$ROOT/apps/mobile"
MODE="${1:-debug}"

API_BASE="${API_BASE_URL:-https://2sc.prestoai.cn}"
WEB_BASE="${WEB_BASE_URL:-https://2sc.prestoai.cn}"
TARGET_PLATFORM="${TARGET_PLATFORM:-android-arm64}"

android_flutter_pub_get

SECONDS=0
case "$MODE" in
  debug)
    echo "Building debug APK (fastest)…"
    (cd "$MOBILE" && "$FLUTTER" build apk --debug \
      --target-platform "$TARGET_PLATFORM" \
      --android-skip-build-dependency-validation \
      --dart-define="API_BASE_URL=$API_BASE" \
      --dart-define="WEB_BASE_URL=$WEB_BASE")
    APK="$MOBILE/build/app/outputs/flutter-apk/app-debug.apk"
    ;;
  fast-release|fast)
    echo "Building fast release (no obfuscate / no R8)…"
    export FAST_BUILD=1
    export ORG_GRADLE_PROJECT_peiai_fast=true
    (cd "$MOBILE" && "$FLUTTER" build apk --release \
      --target-platform "$TARGET_PLATFORM" \
      --android-skip-build-dependency-validation \
      --dart-define="API_BASE_URL=$API_BASE" \
      --dart-define="WEB_BASE_URL=$WEB_BASE")
    APK="$MOBILE/build/app/outputs/flutter-apk/app-release.apk"
    ;;
  *)
    echo "Usage: $0 [debug|fast-release]" >&2
    exit 2
    ;;
esac
echo "Done in ${SECONDS}s"

if [[ ! -f "$APK" ]]; then
  echo "APK missing: $APK" >&2
  exit 1
fi

echo "OK: $APK"
ls -lh "$APK"
echo "Install: adb install -r \"$APK\""
