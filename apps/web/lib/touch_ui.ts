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

/** 读经划选：系统原生划选 + 应用工具条（含桌面鼠标拖选） */
export function useNativeVerseSelection(): boolean {
  return typeof window !== 'undefined';
}

/**
 * 原生划选落定后是否自动收起系统选区。
 * - 触控 / PWA standalone：必须收起，否则会弹出系统「拷贝 / 翻译」栏
 * - 桌面精细指针：保留浏览器选区高亮
 */
export function shouldAutoCollapseNativeSelection(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (
    window.matchMedia('(display-mode: standalone)').matches
    || nav.standalone === true
  ) {
    return true;
  }
  // 任意粗指针（手机/多数平板）都收起系统栏
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  return !isFinePointerUI();
}
