#!/usr/bin/env bash
# 本机快速装包：debug（最快）或 FAST release（无混淆/R8）。
# 不写官网 downloads。模拟器联调优先用本脚本或 flutter run。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
MODE="${1:-debug}" # debug | fast-release

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

export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$ROOT/.gradle-home}"
if [[ -d "$MOBILE/.android-sdk-shim/platforms/android-35" ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-$MOBILE/.android-sdk-shim}"
  export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
fi

API_BASE="${API_BASE_URL:-https://2sc.prestoai.cn}"
WEB_BASE="${WEB_BASE_URL:-https://2sc.prestoai.cn}"
TARGET_PLATFORM="${TARGET_PLATFORM:-android-arm64}"

cd "$MOBILE"
"$FLUTTER" pub get

case "$MODE" in
  debug)
    echo "Building debug APK (fastest local path)…"
    "$FLUTTER" build apk --debug \
      --target-platform "$TARGET_PLATFORM" \
      --android-skip-build-dependency-validation \
      --dart-define="API_BASE_URL=$API_BASE" \
      --dart-define="WEB_BASE_URL=$WEB_BASE"
    APK="$MOBILE/build/app/outputs/flutter-apk/app-debug.apk"
    ;;
  fast-release|fast)
    echo "Building fast release (no Dart obfuscate / no R8)…"
    export FAST_BUILD=1
    export ORG_GRADLE_PROJECT_peiai_fast=true
    "$FLUTTER" build apk --release \
      --target-platform "$TARGET_PLATFORM" \
      --android-skip-build-dependency-validation \
      --dart-define="API_BASE_URL=$API_BASE" \
      --dart-define="WEB_BASE_URL=$WEB_BASE"
    APK="$MOBILE/build/app/outputs/flutter-apk/app-release.apk"
    ;;
  *)
    echo "Usage: $0 [debug|fast-release]" >&2
    exit 2
    ;;
esac

if [[ ! -f "$APK" ]]; then
  echo "APK missing: $APK" >&2
  exit 1
fi

echo "OK: $APK"
ls -lh "$APK"
echo "Install: adb install -r \"$APK\""
