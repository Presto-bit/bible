import {
  hitTestsReaderInteractive,
  isReaderInteractiveEventTarget,
} from './reader_gesture';

const SHELF_INTERACTIVE_SEL =
  'video,a,button,input,textarea,select,label,summary,[role="button"],[role="link"],.shelf-reader-bottom-btn,.shelf-reader-bottom,.shelf-pdf-toolbar-btn,.shelf-pdf-inline-tools,.shelf-pdf-exit-fullscreen,.shelf-lesson-media-fab,.shelf-media-tile,.shelf-lesson-lightbox,.shelf-fullscreen-overlay,.shelf-focus-bar,.reader-focus-bar';

/**
 * 可竖滚区域（Word / 教案）仍允许发起横滑；轴方向在 useShelfTurn.moveDrag 判定，
 * 与圣经 Tab useReaderPageTurn 一致，不在 pointerdown 阶段拦截。
 */
export function shelfTurnStartsInVerticalScroll(
  _target: EventTarget | null,
  _clientX?: number,
): boolean {
  return false;
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
