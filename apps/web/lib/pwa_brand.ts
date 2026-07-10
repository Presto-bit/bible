/** PWA 主屏 / 启动图 / Manifest 品牌常量（以 iOS Safari 为基准） */

import { BRAND_NAME, BRAND_PWA_SUBTITLE } from './brand';

/** 主视觉源：仓库根 icon.png（npm run generate-pwa 导出） */
export const PWA_ICON_SOURCE = '/icon-512.png';

export const PWA_HOME_NAME = BRAND_NAME;
export const PWA_HOME_SUBTITLE = BRAND_PWA_SUBTITLE;
export const PWA_MANIFEST_DESCRIPTION = `${PWA_HOME_SUBTITLE}，在话语中相遇`;

/** 启动图 / Manifest 背景（与 icon.png 红底一致，不随 app 主题变） */
export const PWA_BG_COLOR = '#E32626';

export const PWA_INK = '#FFFFFF';
export const PWA_INK_SOFT = 'rgba(255,255,255,0.85)';

/** iPhone 15/16 竖屏逻辑尺寸（pt） */
export const PWA_SPLASH_BASE = { width: 393, height: 852, dpr: 3 } as const;

/** iOS apple-touch-startup-image：物理像素 + media 查询 */
export const IOS_STARTUP_IMAGES: { file: string; media: string }[] = [
  {
    file: 'splash-iphone16.png',
    media:
      '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    file: 'splash-iphone16plus.png',
    media:
      '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    file: 'splash-iphone14.png',
    media:
      '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    file: 'splash-iphone11.png',
    media:
      '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    file: 'splash-iphone8.png',
    media:
      '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    file: 'splash-iphonese.png',
    media:
      '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  },
];

export const IOS_STARTUP_FALLBACK = 'splash-iphone16.png';
