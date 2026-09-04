/** 桌面精确指针：与 touch_ui.isFinePointerUI 同源，供壳层 class 同步 */
export const PC_UI_MQ = '(hover: hover) and (pointer: fine)';

export function isPcUi(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(PC_UI_MQ).matches;
}

/** 挂载 body.pc-ui，供 CSS 与 JS 统一桌面态 */
export function initPcUiClass(): () => void {
  if (typeof window === 'undefined') return () => {};

  const mq = window.matchMedia(PC_UI_MQ);
  const apply = () => {
    document.body.classList.toggle('pc-ui', mq.matches);
  };
  apply();
  mq.addEventListener('change', apply);
  return () => {
    mq.removeEventListener('change', apply);
    document.body.classList.remove('pc-ui');
  };
}
