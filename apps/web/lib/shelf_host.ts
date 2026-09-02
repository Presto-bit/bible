/** 书架在 Android Flutter H5 宿主内的 chrome 同步（对齐 PWA 全屏阅读）。 */

import { isFlutterH5Host, peiaiOpenNative } from './flutter_h5_bridge';

export function notifyFlutterShelfPath(path?: string) {
  if (!isFlutterH5Host()) return;
  const p =
    path ??
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '');
  if (!p) return;
  peiaiOpenNative({ type: 'path_changed', path: p });
}

export function setShelfReaderChrome(active: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('shelf-reader-open', active);
  document.body.classList.toggle('shelf-reader-active', active);
}
