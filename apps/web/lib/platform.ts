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
    return '已安装到主屏幕：读本机账号自动云端备份。换机请设置用户名或绑定手机。';
  }
  if (isFinePointerDesktop()) {
    return '浏览器访问：登录后数据自动云端同步，换机请设置用户名或绑定手机。';
  }
  return '浏览器临时访问：建议添加到主屏幕，或设置用户名以便换机恢复。';
}
