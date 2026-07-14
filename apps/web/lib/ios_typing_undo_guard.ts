/** 减轻 iOS「摇动 → 撤销键入」误弹：程序改写输入后丢弃原生撤销栈 / 切后台失焦。 */

export function blurActiveTextField() {
  if (typeof document === 'undefined') return;
  const el = document.activeElement;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  ) {
    el.blur();
  }
}

/** PWA/Web：切后台、页面隐藏时失焦，避免行走晃动触发「撤销键入」。 */
export function initIosTypingUndoGuard() {
  if (typeof document === 'undefined') return () => {};

  const onHide = () => {
    if (document.visibilityState === 'hidden') blurActiveTextField();
  };

  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', blurActiveTextField);
  return () => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', blurActiveTextField);
  };
}
