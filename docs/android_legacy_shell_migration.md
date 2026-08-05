# 旧安卓壳 → Flutter 主包迁移

## 谁在迁移

| 旧包 | 工程 | 状态 |
|------|------|------|
| Chrome Host / TWA | `apps/android-pwa-host` | 非主推 |
| 整站 WebView | `apps/android-twa` | 冻结 |
| Flutter 主包 | `apps/mobile` | **官网主推** |

## 用户侧

1. 官网「下载安装包」→ Flutter APK（`runtime: flutter`）。
2. **同一 packageId** `cn.prestoai.peiai` 时，新包可覆盖安装。
3. 建议用户：**设密**后重装/覆盖，用手机号或用户 ID 登录同步。
4. 不要引导「装 Chrome 才能用」——当前主路径不依赖 Chrome。

## 运营侧

1. 用 `scripts/publish_flutter_apk.sh` 发 `full_apk`。
2. 发版轨：
   - `web`：H5/IM/活动
   - `shorebird`：仅壳热修（可选）
   - `full_apk`：原生能力 / 商店或官网整包
3. 埋点区分：`android_shell`（旧）/ `android_flutter` / `android_h5_tab`。

## assetlinks

`apps/web/public/.well-known/assetlinks.json` 中 `package_name` 保持 `cn.prestoai.peiai`，`sha256` 与 **发布签名证书**一致。调试包指纹不同，不可用于生产 App Links。
