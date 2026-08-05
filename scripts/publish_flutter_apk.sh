#!/usr/bin/env bash
# 构建 Flutter 安卓 APK 并发布到 apps/web/public/downloads/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
OUT_DIR="$ROOT/apps/web/public/downloads"
APK_NAME="biai-android.apk"
META="$OUT_DIR/biai-android.json"

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

# 与 Web 默认一致：API + H5 同 origin（2sc）
API_BASE="${API_BASE_URL:-https://2sc.prestoai.cn}"
WEB_BASE="${WEB_BASE_URL:-https://2sc.prestoai.cn}"

# 本机缺 android-35 时可用 apps/mobile/.android-sdk-shim
if [[ -d "$MOBILE/.android-sdk-shim/platforms/android-35" ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-$MOBILE/.android-sdk-shim}"
  export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
fi
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$ROOT/.gradle-home}"

# P0 体积：仅 arm64 + R8（Gradle minify）+ Dart 混淆
# 真机 32 位需另跑：--target-platform android-arm
TARGET_PLATFORM="${TARGET_PLATFORM:-android-arm64}"
SYMBOLS_DIR="$MOBILE/build/symbols"

cd "$MOBILE"
"$FLUTTER" pub get
mkdir -p "$SYMBOLS_DIR"
"$FLUTTER" build apk --release \
  --target-platform "$TARGET_PLATFORM" \
  --obfuscate \
  --split-debug-info="$SYMBOLS_DIR" \
  --android-skip-build-dependency-validation \
  --dart-define="API_BASE_URL=$API_BASE" \
  --dart-define="WEB_BASE_URL=$WEB_BASE"

# fat 名仍为 app-release.apk；带 --target-platform 时亦落此路径
APK_SRC="$MOBILE/build/app/outputs/flutter-apk/app-release.apk"
if [[ ! -f "$APK_SRC" ]]; then
  # split-per-abi 遗留命名兜底
  case "$TARGET_PLATFORM" in
    android-arm64) APK_SRC="$MOBILE/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk" ;;
    android-arm)   APK_SRC="$MOBILE/build/app/outputs/flutter-apk/app-armeabi-v7a-release.apk" ;;
    android-x64)   APK_SRC="$MOBILE/build/app/outputs/flutter-apk/app-x86_64-release.apk" ;;
  esac
fi
if [[ ! -f "$APK_SRC" ]]; then
  echo "APK missing: $APK_SRC" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
cp -f "$APK_SRC" "$OUT_DIR/$APK_NAME"
BYTES=$(wc -c < "$OUT_DIR/$APK_NAME" | tr -d ' ')
SHA=$(shasum -a 256 "$OUT_DIR/$APK_NAME" | awk '{print $1}')

VER_LINE=$(grep -E '^version:' "$MOBILE/pubspec.yaml" | head -1 | awk '{print $2}')
VERSION_NAME="${VER_LINE%%+*}"
VERSION_CODE="${VER_LINE##*+}"
CERT_SHA="${ANDROID_CERT_SHA256:-}"
if [[ -z "$CERT_SHA" && -f "$HOME/.android/debug.keystore" ]]; then
  CERT_SHA=$(keytool -list -v -keystore "$HOME/.android/debug.keystore" \
    -alias androiddebugkey -storepass android -keypass android 2>/dev/null \
    | awk '/SHA256:/{print $2; exit}')
fi
CERT_SHA="${CERT_SHA:-79:5F:74:9B:BD:35:12:CF:EF:3D:CA:0D:68:D3:C4:7F:16:4A:3A:2D:49:26:49:B6:C4:90:A1:66:C5:A0:12:9C}"

cat > "$META" <<EOF
{
  "packageId": "cn.prestoai.peiai",
  "versionCode": ${VERSION_CODE:-30},
  "versionName": "${VERSION_NAME:-3.0.0}",
  "bytes": ${BYTES},
  "sha256": "${SHA}",
  "downloadUrl": "/downloads/biai-android.apk",
  "iconUrl": "/downloads/biai-android-icon.png",
  "icon192Url": "/downloads/biai-android-icon-192.png",
  "certSha256": "${CERT_SHA}",
  "runtime": "flutter",
  "generatorApp": "apps/mobile Flutter"
}
EOF

echo "Published $OUT_DIR/$APK_NAME ($BYTES bytes)"
echo "sha256=$SHA"
echo "Meta: $META"
