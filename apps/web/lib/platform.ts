/** 运行环境检测（PWA / 浏览器） */

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  );
}

/** 五 Tab 保活：PWA 与 PC 浏览器均启用，二级页仍走 Next 路由 */
export function isTabKeepAliveEnabled(): boolean {
  return typeof window !== 'undefined';
}

export function isFinePointerDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function platformAccountHint(): string {
  if (isStandalonePwa()) {
    return '已保存到主屏幕：请用手机号/用户名登录并等待同步完成。重装前务必已登录；删掉重装后需重新登录才能拉回进度与成就。';
  }
  if (isFinePointerDesktop()) {
    return '电脑浏览器：建议登录后保存到桌面。未登录时数据仅本机，重装后可能丢失。';
  }
  return '浏览器临时访问：建议登录并添加到主屏幕；换机请用手机号/用户名登录后等待同步完成。';
}
