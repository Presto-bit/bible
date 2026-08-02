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
cp -f "$APK_OUT" "$WEB_DL/peiai-android.apk"

VERSION_CODE="$(grep -E 'versionCode\s*=' app/build.gradle.kts | head -1 | sed -E 's/.*versionCode\s*=\s*([0-9]+).*/\1/')"
VERSION_NAME="$(grep -E 'versionName\s*=' app/build.gradle.kts | head -1 | sed -E 's/.*versionName\s*=\s*"([^"]+)".*/\1/')"
BYTES="$(wc -c < "$WEB_DL/peiai-android.apk" | tr -d ' ')"
SHA256="$(shasum -a 256 "$WEB_DL/peiai-android.apk" | awk '{print $1}')"
STORE_PASS="$(grep '^storePassword=' keystore/keystore.properties | cut -d= -f2-)"
CERT_SHA="$(keytool -list -v \
  -keystore keystore/peiai-upload.jks \
  -alias peiai \
  -storepass "$STORE_PASS" \
  2>/dev/null | awk '/SHA256:/{print $2; exit}')"

cat > "$WEB_DL/peiai-android.json" <<EOF
{
  "packageId": "cn.prestoai.peiai",
  "versionCode": ${VERSION_CODE},
  "versionName": "${VERSION_NAME}",
  "bytes": ${BYTES},
  "sha256": "${SHA256}",
  "downloadUrl": "/downloads/peiai-android.apk",
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

echo "OK: $WEB_DL/peiai-android.apk (${BYTES} bytes)"
echo "meta: $WEB_DL/peiai-android.json"
echo "DAL: $WELL/assetlinks.json"
echo "cert SHA-256: ${CERT_SHA}"
