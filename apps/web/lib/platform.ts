/** 运行环境检测（PWA / 浏览器） */

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  );
}

export function platformAccountHint(): string {
  if (isStandalonePwa()) {
    return '已安装到主屏幕：读本机账号自动云端备份。换机请设置用户名或绑定手机。';
  }
  return '浏览器临时访问：建议添加到主屏幕，或设置用户名以便换机恢复。';
}
