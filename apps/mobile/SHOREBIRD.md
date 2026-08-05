# Shorebird 使用约定（壳热修）

与产品 §24.7 对齐。

| 允许 | 禁止 |
|------|------|
| 闪退、提醒、推送、安全区、H5 桥、原生读经小修 | IM/活动/协议/帮助业务改动 |
| 紧急原生补丁 | 代替 Web 发发现改版 |

## 接入步骤（可选）

1. `dart pub global activate shorebird_cli`
2. `shorebird init`（会写入 `shorebird.yaml` 的 `app_id`）
3. 首次：`shorebird release android`（整包基线）
4. 之后：`shorebird patch android` 仅修壳层

未配置 Shorebird 时，原生修复走整包 `full_apk`（`scripts/publish_flutter_apk.sh`）。  
**业务默认发 Web**（含安卓嵌 H5 的发现）。

## 三轨发版

| 轨 | 内容 | 工具 |
|----|------|------|
| `web` | H5、发现/IM、活动 | 正常 Web 部署 |
| `shorebird` | 壳热修 | Shorebird patch |
| `full_apk` | 原生能力、签名变更、大版本 | 官网 APK / 商店 |
