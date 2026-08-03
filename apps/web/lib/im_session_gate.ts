/** IM 会话路径 / 输入态：推迟硬刷、半屏引导、壳返回等 */

export function isDiscoverImSessionPath(pathname?: string): boolean {
  const p =
    pathname
    || (typeof window !== 'undefined' ? window.location.pathname : '');
  return /\/discover\/(dm|group)\//.test(p);
}

/** 系统返回应回到消息列表的发现二级页 */
export function isDiscoverShellBackPath(pathname?: string): boolean {
  const p =
    pathname
    || (typeof window !== 'undefined' ? window.location.pathname : '');
  return /\/discover\/(dm|group|contacts|friends|invites|join)/.test(p);
}

export function isImComposerActive(): boolean {
  if (typeof document === 'undefined') return false;
  const ae = document.activeElement;
  if (
    ae instanceof HTMLElement
    && ae.closest('.im-composer-bar, .dm-composer-dock, .group-wechat-composer')
  ) {
    return true;
  }
  return document.body.classList.contains('im-keyboard');
}

/** 硬刷 / 半屏引导等勿打断进行中的聊天 */
export function shouldDeferShellInterrupt(): boolean {
  return isDiscoverImSessionPath() || isImComposerActive();
}
