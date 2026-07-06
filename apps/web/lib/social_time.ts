/** 好友动态发布时间展示 */
export function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const thisYear = new Date().getFullYear();
  if (y === thisYear) return `${m}月${day}日`;
  return `${y}年${m}月${day}日`;
}
