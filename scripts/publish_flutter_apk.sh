#!/usr/bin/env bash
# 构建 Flutter 安卓 APK 并发布到 apps/web/public/downloads/
#
# 用法：
#   ./scripts/publish_flutter_apk.sh              # 官网全量（arm64 + R8 + Dart 混淆，慢）
#   FAST_BUILD=1 ./scripts/publish_flutter_apk.sh # 快包（无混淆/R8，2–5min，勿发官网）
#   ORG_GRADLE_OFFLINE=0 ./scripts/…              # 强制在线拉依赖
#   TARGET_PLATFORM=android-arm ./scripts/…       # 32 位真机
#
# 提速要点：Gradle 9.1-bin 腾讯镜像 + .gradle-home 缓存 + 自动离线 + 停 Daemon。
# 日常联调请用：FAST_BUILD=1 ./scripts/publish_flutter_apk.sh
# 或：./scripts/build_flutter_apk_dev.sh fast-release
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
_ANDROID_ENV_ROOT="$ROOT"
# shellcheck source=scripts/_android_build_env.sh
source "$ROOT/scripts/_android_build_env.sh"

MOBILE="$ROOT/apps/mobile"
OUT_DIR="$ROOT/apps/web/public/downloads"
APK_NAME="biai-android.apk"
META="$OUT_DIR/biai-android.json"

API_BASE="${API_BASE_URL:-https://2sc.prestoai.cn}"
WEB_BASE="${WEB_BASE_URL:-https://2sc.prestoai.cn}"
TARGET_PLATFORM="${TARGET_PLATFORM:-android-arm64}"
SYMBOLS_DIR="$MOBILE/build/symbols"
FAST_BUILD="${FAST_BUILD:-0}"

BUILD_ARGS=(
  build apk --release
  --target-platform "$TARGET_PLATFORM"
  --android-skip-build-dependency-validation
  --dart-define="API_BASE_URL=$API_BASE"
  --dart-define="WEB_BASE_URL=$WEB_BASE"
)

if [[ "$FAST_BUILD" == "1" ]]; then
  echo "FAST_BUILD=1：跳过 Dart 混淆与 R8（仅本机/联调，勿当官网包）"
  export FAST_BUILD=1
  export ORG_GRADLE_PROJECT_peiai_fast=true
else
  BUILD_ARGS+=(
    --obfuscate
    --split-debug-info="$SYMBOLS_DIR"
  )
  mkdir -p "$SYMBOLS_DIR"
fi

SECONDS=0
android_flutter_pub_get
echo "→ flutter build (${BUILD_ARGS[*]})"
(cd "$MOBILE" && "$FLUTTER" "${BUILD_ARGS[@]}")
echo "Build finished in ${SECONDS}s"

APK_SRC="$MOBILE/build/app/outputs/flutter-apk/app-release.apk"
if [[ ! -f "$APK_SRC" ]]; then
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

if [[ "$FAST_BUILD" == "1" ]]; then
  echo "APK ready (fast, not published): $APK_SRC"
  ls -lh "$APK_SRC"
  exit 0
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
