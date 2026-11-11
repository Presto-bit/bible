/** 产品说明文档修订月份展示（YYYY-MM → 2026年11月） */
export function formatChangelogMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec((ym || '').trim());
  if (!m) return ym;
  const month = parseInt(m[2], 10);
  return `${m[1]}年${month}月`;
}
