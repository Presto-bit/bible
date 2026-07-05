/** 是否以触控为主（手机 H5 / PWA / 平板竖屏） */
export function isTouchPrimaryUI(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}
