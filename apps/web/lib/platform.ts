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
    return '已保存到桌面/主屏幕：请登录账号，读经记录会保存在账号中。重装前务必已登录；卸载时不要清除网站数据。';
  }
  if (isFinePointerDesktop()) {
    return '电脑浏览器：建议登录后保存到桌面 App。仅本机不设密码时，重装桌面版后读经历史可能丢失。';
  }
  return '浏览器临时访问：建议添加到主屏幕，或设置用户名以便换机恢复。';
}
