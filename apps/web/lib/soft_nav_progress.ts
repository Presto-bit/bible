/** Soft nav（Next router.push）进度：弱网时给即时反馈，避免「点了没反应」。 */

const EVENT = 'presto-soft-nav';

export type SoftNavProgressDetail = {
  active: boolean;
  href?: string;
};

let activeHref: string | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function emit(active: boolean, href?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SoftNavProgressDetail>(EVENT, {
      detail: { active, href },
    }),
  );
}

/** 二级页 soft nav 开始：立刻亮顶栏进度 */
export function beginSoftNavProgress(href: string): void {
  activeHref = href;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  emit(true, href);
  // 兜底：极慢网也不要永久卡进度条
  clearTimer = setTimeout(() => {
    if (activeHref === href) endSoftNavProgress();
  }, 12000);
}

/** 路径已切换或导航取消时收起 */
export function endSoftNavProgress(): void {
  activeHref = null;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  emit(false);
}

export function subscribeSoftNavProgress(
  onChange: (detail: SoftNavProgressDetail) => void,
): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<SoftNavProgressDetail>).detail;
    onChange(detail ?? { active: false });
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
