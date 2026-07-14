/** PC：横滑容器悬停时把纵轮转发给页面滚动，避免整页「卡住」。 */

const HORIZONTAL_TRAP_SEL =
  '.rail, .home-rail, .badge-row, .chip-swipe, .friends-swipe-track, .story-entry-scroll, .story-mode-timeline-rail, .home-hero-carousel';

function isFinePointer(): boolean {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function canScrollY(el: HTMLElement): boolean {
  const oy = getComputedStyle(el).overflowY;
  if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
  return el.scrollHeight > el.clientHeight + 1;
}

/** 返回卸载函数。仅桌面精确指针生效。 */
export function initPcWheelPassthrough(): () => void {
  if (typeof window === 'undefined' || !isFinePointer()) return () => {};

  const onWheel = (e: WheelEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const trap = target.closest(HORIZONTAL_TRAP_SEL);
    if (!(trap instanceof HTMLElement)) return;
    if (canScrollY(trap)) return;

    let el: HTMLElement | null = trap.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      if (canScrollY(el)) return;
      el = el.parentElement;
    }

    e.preventDefault();
    window.scrollBy(0, e.deltaY);
  };

  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  return () => window.removeEventListener('wheel', onWheel, { capture: true });
}
