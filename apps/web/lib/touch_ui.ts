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

/** 读经划选：触控原生划选 + 桌面鼠标拖选，共用应用工具条 */
export function useNativeVerseSelection(): boolean {
  return typeof window !== 'undefined';
}
