import {
  hitTestsReaderInteractive,
  isReaderInteractiveEventTarget,
} from './reader_gesture';

const SHELF_INTERACTIVE_SEL =
  'video,a,button,input,textarea,select,label,summary,[role="button"],[role="link"],.shelf-reader-bottom-btn,.shelf-reader-bottom,.shelf-pdf-toolbar-btn,.shelf-pdf-inline-tools,.shelf-pdf-exit-fullscreen,.shelf-lesson-media-fab,.shelf-media-tile,.shelf-lesson-lightbox,.shelf-fullscreen-overlay,.shelf-focus-bar,.reader-focus-bar';

const SHELF_VERTICAL_SCROLL_SEL = '';

function isShelfVerticalScrollElement(el: Element | null | undefined): boolean {
  if (!el || !SHELF_VERTICAL_SCROLL_SEL) return false;
  try {
    return Boolean(el.closest(SHELF_VERTICAL_SCROLL_SEL));
  } catch {
    return false;
  }
}

/**
 * 章级横滑与 PDF / Word 共用同一套轴判定；不再因落在可竖滚容器内而抬高横滑门槛。
 * 竖滚由 moveDrag 识别 axis=y 后放行，与 PDF 区域行为一致。
 */
export function shelfTurnStartsInVerticalScroll(
  target: EventTarget | null,
  clientX?: number,
): boolean {
  if (typeof clientX === 'number' && typeof window !== 'undefined') {
    const edge = 88;
    if (clientX < edge || clientX > window.innerWidth - edge) return false;
  }
  if (!SHELF_VERTICAL_SCROLL_SEL) return false;
  if (!(target instanceof Element)) {
    if (target instanceof Node) return isShelfVerticalScrollElement(target.parentElement);
    return false;
  }
  return isShelfVerticalScrollElement(target);
}

function isShelfInteractiveElement(el: Element | null | undefined): boolean {
  if (!el) return false;
  try {
    return Boolean(el.closest(SHELF_INTERACTIVE_SEL));
  } catch {
    return false;
  }
}

export function shouldYieldShelfTurn(
  target: EventTarget | null,
  clientX: number,
  clientY: number,
  event?: Event,
): boolean {
  if (isReaderInteractiveEventTarget(target, event)) return true;
  if (target instanceof Element && isShelfInteractiveElement(target)) return true;
  if (target instanceof Node && !(target instanceof Element)) {
    const parent = target.parentElement;
    if (parent && isShelfInteractiveElement(parent)) return true;
  }
  if (typeof document === 'undefined') return false;
  const r = 10;
  const points: Array<[number, number]> = [
    [clientX, clientY],
    [clientX, clientY - r],
    [clientX, clientY + r],
    [clientX - r, clientY],
    [clientX + r, clientY],
  ];
  for (const [x, y] of points) {
    const el = document.elementFromPoint(x, y);
    if (el && isShelfInteractiveElement(el)) return true;
  }
  return hitTestsReaderInteractive(clientX, clientY);
}
