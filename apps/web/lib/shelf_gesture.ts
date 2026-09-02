import {
  hitTestsReaderInteractive,
  isReaderInteractiveEventTarget,
} from './reader_gesture';

const SHELF_INTERACTIVE_SEL =
  'video,a,button,input,textarea,select,label,summary,[role="button"],[role="link"],.shelf-reader-bottom-btn,.shelf-reader-bottom,.shelf-pdf-toolbar-btn,.shelf-media-tile,.shelf-lesson-lightbox,.shelf-fullscreen-overlay';

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
