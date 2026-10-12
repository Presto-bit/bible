/** 是否以触控为主（手机 H5 / 平板竖屏） */
export function isTouchPrimaryUI(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/** 桌面精确指针（鼠标 / 触控板） */
export function isFinePointerUI(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * 原生划选落定后是否会弹出系统拷贝栏（须改用应用内词选）。
 * - 触控 / PWA standalone / 安卓壳：是
 * - 桌面精细指针：否（保留浏览器划选）
 */
export function shouldAutoCollapseNativeSelection(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (
    /PeiaiAndroidShell\//i.test(nav.userAgent)
    || window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || nav.standalone === true
  ) {
    return true;
  }
  // 任意粗指针（手机/多数平板）都收起系统栏
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  return !isFinePointerUI();
}

/**
 * 是否使用系统原生划选。
 * 触控/PWA 关闭：改用应用内长按词选，避免「拷贝/高亮/查阅」系统栏，并支持跟手拖动扩选。
 * 桌面精细指针开启：保留鼠标拖选。
 */
export function useNativeVerseSelection(): boolean {
  if (typeof window === 'undefined') return false;
  return !shouldAutoCollapseNativeSelection();
}
