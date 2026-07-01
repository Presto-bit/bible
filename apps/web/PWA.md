# PWA 图标与名称自定义

用户将 H5 添加到手机主屏幕时，显示的**应用名称**和**图标**来自以下文件，可自行替换设计。

## 需要替换的文件

目录：`apps/web/public/`

| 文件 | 用途 | 建议尺寸 |
|------|------|----------|
| `icon-192.png` | Android / 通用 PWA 图标 | 192×192 |
| `icon-512.png` | 启动屏、高分辨率图标 | 512×512 |
| `apple-touch-icon.png` | iOS「添加到主屏幕」 | 180×180（或 192×192） |
| `icon.svg` | 可选矢量备用 | 任意 |

## 修改应用名称

编辑 `apps/web/public/manifest.webmanifest`：

```json
{
  "name": "你的完整应用名",
  "short_name": "主屏短名",
  "description": "副标题描述"
}
```

同时建议同步修改 `apps/web/app/layout.tsx` 中的：

- `metadata.title`
- `metadata.appleWebApp.title`

这样浏览器标签页与 iOS 主屏幕名称一致。

## 设计建议

1. **maskable 图标**：`icon-512.png` 同时用于 `purpose: "maskable"`，重要图形请放在中心 80% 安全区内，避免被系统裁圆角。
2. **背景色**：与 `manifest.webmanifest` 的 `background_color`、`theme_color` 协调（当前为 `#f7f4ee` / `#4f6b5d`）。
3. **格式**：主图标使用 PNG；`icon.svg` 仅作补充。

## 生效方式

本地替换文件后重新构建并部署 Web 服务：

```bash
cd apps/web && npm run build
# 或项目根目录
bash release.sh
```

已安装到主屏幕的用户可能需要**删除旧快捷方式后重新添加**，才能看到新图标与名称。
