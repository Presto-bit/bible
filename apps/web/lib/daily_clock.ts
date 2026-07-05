/** 每日内容时钟：与后端 daily_clock.py 对齐，按北京时间自然日 0:00 切换。 */

const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 北京时间 yyyy-mm-dd */
export function chinaTodayYmd(at: Date = new Date()): string {
  const cn = new Date(at.getTime() + CN_OFFSET_MS);
  return `${cn.getUTCFullYear()}-${String(cn.getUTCMonth() + 1).padStart(2, '0')}-${String(
    cn.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** 距下一次北京时间 0:00 的毫秒数。 */
export function msUntilChinaMidnight(at: Date = new Date()): number {
  const cn = new Date(at.getTime() + CN_OFFSET_MS);
  const nextMidnightUtc = Date.UTC(cn.getUTCFullYear(), cn.getUTCMonth(), cn.getUTCDate() + 1);
  const nextMidnightLocal = nextMidnightUtc - CN_OFFSET_MS;
  return Math.max(0, nextMidnightLocal - at.getTime());
}

/**
 * 在页面可见时：北京时间跨日立即回调；并在每次 0:00 定时触发。
 * 返回取消函数。
 */
export function watchChinaDayChange(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let tracked = chinaTodayYmd();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const bumpIfNewDay = () => {
    const today = chinaTodayYmd();
    if (today === tracked) return;
    tracked = today;
    onChange();
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      bumpIfNewDay();
      schedule();
    }, msUntilChinaMidnight() + 50);
  };

  const onVis = () => {
    if (document.visibilityState !== 'visible') return;
    bumpIfNewDay();
  };

  schedule();
  window.addEventListener('focus', bumpIfNewDay);
  document.addEventListener('visibilitychange', onVis);

  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener('focus', bumpIfNewDay);
    document.removeEventListener('visibilitychange', onVis);
  };
}
