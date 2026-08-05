# Flutter 安卓 App（主分发）

产品规格：**§24** — iOS PWA + Android Flutter；**IM 等 = 嵌 H5 白名单**；读经/小爱/首页 = 原生。

## 关键路径

| 路径 | 说明 |
|------|------|
| `lib/core/h5_host_page.dart` | WebView 容器 + 主题/session 注入 + `PeiaiFlutter` 通道 |
| `lib/core/h5_whitelist.dart` | 允许嵌 H5 的 path（与 web `h5_whitelist.ts` 同步） |
| `lib/core/open_h5.dart` | 统一打开 H5 |
| `lib/core/deep_link.dart` | App Link / 通知 payload 映射 |
| `lib/features/social/discover_screen.dart` | 发现 Tab = H5 `/discover` |
| `lib/core/config.dart` | `WEB_BASE_URL` / `h5Uri` |
| `lib/main.dart` | 深链监听 + 通知 payload |

## 构建与发布

```bash
# 官网全量（默认 arm64 + R8 + Dart 混淆）— 慢是预期
./scripts/publish_flutter_apk.sh

# 本机联调（优先）
./scripts/build_flutter_apk_dev.sh debug          # 最快
./scripts/build_flutter_apk_dev.sh fast-release   # release 形态但无混淆/R8
# 或：FAST_BUILD=1 ./scripts/publish_flutter_apk.sh  # 不拷官网

# 纯离线（依赖缓存已齐时）
ORG_GRADLE_OFFLINE=1 ./scripts/publish_flutter_apk.sh

# 手动全量
cd apps/mobile
flutter pub get
flutter build apk --release \
  --target-platform android-arm64 \
  --obfuscate \
  --split-debug-info=build/symbols \
  --dart-define=API_BASE_URL=https://2sc.prestoai.cn \
  --dart-define=WEB_BASE_URL=https://2sc.prestoai.cn
```

**打包加速注意（`android/gradle.properties`）**

- 堆约 **3.5G**（避免 8G 把 16G 机器 OOM）
- `parallel` + `caching` 开；默认 **不要** `offline`（缓存不齐会更慢/失败）
- 打包时尽量先关模拟器
- 日常用 **debug / FAST_BUILD**，官网再用全量

- **体积 P0**：仅 `arm64-v8a` + Gradle minify/shrinkResources；32 位：`TARGET_PLATFORM=android-arm ./scripts/publish_flutter_apk.sh`
- applicationId：`cn.prestoai.peiai`
- 版本：`pubspec.yaml` 的 `version: name+code`（如 `3.0.2+32`）

## Shorebird

见 `SHOREBIRD.md` / `shorebird.yaml`。壳热修；**禁止**业务走 Shorebird。

## H5 ↔ 原生

Web：

```ts
import { peiaiOpenNativeAssistant } from '@/lib/flutter_h5_bridge';
peiaiOpenNativeAssistant({ ref: 'JHN.3.16', q: '这节什么意思？' });
```

## 与旧壳包

- `apps/android-twa`：冻结 WebView 整站壳  
- `apps/android-pwa-host`：Chrome Host 实验  
见 `docs/android_legacy_shell_migration.md`。

## 验收

`docs/android_dual_end_qa.md`
