#!/usr/bin/env bash
# 构建彼爱 TWA release APK，并同步到 Web 静态下载目录。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
WEB_DL="$REPO/apps/web/public/downloads"
WELL="$REPO/apps/web/public/.well-known"
APK_OUT="$ROOT/app/build/outputs/apk/release/app-release.apk"

cd "$ROOT"

if [[ ! -f keystore/keystore.properties ]]; then
  echo "缺少 keystore/keystore.properties（可从 .example 复制）" >&2
  exit 1
fi

if [[ ! -f local.properties ]]; then
  if [[ -n "${ANDROID_HOME:-}" ]]; then
    echo "sdk.dir=$ANDROID_HOME" > local.properties
  elif [[ -d "$HOME/Library/Android/sdk" ]]; then
    echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties
  else
    echo "缺少 local.properties（需 sdk.dir）" >&2
    exit 1
  fi
fi

run_gradle() {
  if [[ -x ./gradlew ]]; then
    if ./gradlew "$@" ; then
      return 0
    fi
  fi
  local cached
  cached="$(find "$HOME/.gradle/wrapper/dists" -type f -path '*/bin/gradle' 2>/dev/null | sort -r | head -1 || true)"
  if [[ -n "$cached" && -x "$cached" ]]; then
    "$cached" "$@"
    return $?
  fi
  echo "找不到可用的 Gradle" >&2
  return 1
}

run_gradle :app:assembleRelease --no-daemon

mkdir -p "$WEB_DL" "$WELL"
cp -f "$APK_OUT" "$WEB_DL/biai-android.apk"

# 安装包配套图标（站点下载区 / 设置页可用）
ICON_SRC="$REPO/apps/web/public/icon-512.png"
if [[ -f "$ICON_SRC" ]]; then
  cp -f "$ICON_SRC" "$WEB_DL/biai-android-icon.png"
  if command -v sips >/dev/null 2>&1; then
    sips -z 192 192 "$ICON_SRC" --out "$WEB_DL/biai-android-icon-192.png" >/dev/null 2>&1 || true
  fi
fi

VERSION_CODE="$(awk -F'=' '/versionCode[[:space:]]*=/ { gsub(/[^0-9]/, "", $2); if ($2!="") { print $2; exit } }' app/build.gradle.kts)"
VERSION_NAME="$(awk -F'"' '/versionName[[:space:]]*=/ { if ($2!="") { print $2; exit } }' app/build.gradle.kts)"
if [[ -z "$VERSION_CODE" || -z "$VERSION_NAME" ]]; then
  echo "无法从 app/build.gradle.kts 解析 versionCode/versionName" >&2
  exit 1
fi
BYTES="$(wc -c < "$WEB_DL/biai-android.apk" | tr -d ' ')"
SHA256="$(shasum -a 256 "$WEB_DL/biai-android.apk" | awk '{print $1}')"
STORE_PASS="$(grep '^storePassword=' keystore/keystore.properties | cut -d= -f2-)"
CERT_SHA="$(keytool -list -v \
  -keystore keystore/peiai-upload.jks \
  -alias peiai \
  -storepass "$STORE_PASS" \
  2>/dev/null | awk '/SHA256:/{print $2; exit}')"

cat > "$WEB_DL/biai-android.json" <<EOF
{
  "packageId": "cn.prestoai.peiai",
  "versionCode": ${VERSION_CODE},
  "versionName": "${VERSION_NAME}",
  "bytes": ${BYTES},
  "sha256": "${SHA256}",
  "downloadUrl": "/downloads/biai-android.apk",
  "iconUrl": "/downloads/biai-android-icon.png",
  "icon192Url": "/downloads/biai-android-icon-192.png",
  "certSha256": "${CERT_SHA}"
}
EOF

cat > "$WELL/assetlinks.json" <<EOF
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "cn.prestoai.peiai",
      "sha256_cert_fingerprints": [
        "${CERT_SHA}"
      ]
    }
  }
]
EOF

# 同步历史文件名 twa-manifest.json（实为 WebView 壳元数据）
python3 - <<PY
import json
from pathlib import Path
p = Path("twa-manifest.json")
data = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
data.update({
  "packageId": "cn.prestoai.peiai",
  "host": "2sc.prestoai.cn",
  "name": "彼爱",
  "launcherName": "彼爱",
  "display": "standalone",
  "themeColor": "#FFFCFA",
  "themeColorDark": "#FFFCFA",
  "navigationColor": "#FFFCFA",
  "backgroundColor": "#E32626",
  "startUrl": "/",
  "iconUrl": "https://2sc.prestoai.cn/icon-512.png",
  "maskableIconUrl": "https://2sc.prestoai.cn/icon-maskable-512.png",
  "appVersionName": "${VERSION_NAME}",
  "appVersionCode": int("${VERSION_CODE}"),
  "generatorApp": "manual-webview-shell",
  "webManifestUrl": "https://2sc.prestoai.cn/manifest.webmanifest",
  "fallbackType": "webview",
  "fullScopeUrl": "https://2sc.prestoai.cn/",
  "minSdkVersion": 26,
  "orientation": "portrait-primary",
  "fingerprints": ["${CERT_SHA}"],
  "notes": "目录名 android-twa 为历史遗留；实现为 WebView 壳。backgroundColor=冷启动红底，themeColor=纸色壳层。",
})
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

echo "OK: $WEB_DL/biai-android.apk (${BYTES} bytes)"
echo "meta: $WEB_DL/biai-android.json"
echo "DAL: $WELL/assetlinks.json"
echo "manifest: $ROOT/twa-manifest.json → ${VERSION_NAME} (${VERSION_CODE})"
echo "cert SHA-256: ${CERT_SHA}"
