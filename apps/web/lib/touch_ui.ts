import { isStandalonePwa } from './platform';

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

/** 读经划选：触控 / PWA 走系统原生划选；桌面精确指针走词块点选 */
export function useNativeVerseSelection(): boolean {
  if (typeof window === 'undefined') return false;
  return isTouchPrimaryUI() || isStandalonePwa();
}

/** 原生划选落定后是否自动收起系统选区（桌面保留浏览器高亮，避免工具条闪灭） */
export function shouldAutoCollapseNativeSelection(): boolean {
  if (typeof window === 'undefined') return false;
  return !isFinePointerUI();
}
