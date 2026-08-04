/**
 * 读经手势与「点了没反应」单一真相源。
 *
 * 原则（TWA / 安卓 WebView）：
 * 1. 经文内可交互（词典、链接、划词条）优先于横滑翻页
 * 2. 主动作在 pointerdown（见 shell_tap），不要指望 click
 * 3. 全屏半屏挂 body portal；打开前轻量清僵尸层；打开后短窗忽略遮罩关闭
 * 4. 命中检测用 composedPath + 十字邻点，容忍 1～2px 偏触
 *
 * 性能：邻点最多 5 次 elementFromPoint；无分配循环外对象。
 */

export const READER_INTERACTIVE_SEL =
  'a,button,input,textarea,select,label,summary,[role="button"],[role="link"],.proper-noun,.reader-focus-bar,.vsb-icon-btn,.reader-fab,.reader-topbar';

/** 半屏挂上后忽略遮罩关闭（同按压 click 落到 backdrop） */
export const SHEET_OPEN_GUARD_MS = 400;

const INTERACTIVE_HIT_RADIUS = 10;

export function isReaderInteractiveElement(el: Element | null | undefined): boolean {
  if (!el) return false;
  try {
    return Boolean(el.closest(READER_INTERACTIVE_SEL));
  } catch {
    return false;
  }
}

/** 用 event.path / composedPath，避免 Text 节点或 shadow 边缘丢命中 */
export function isReaderInteractiveEventTarget(
  target: EventTarget | null,
  event?: Event | { composedPath?: () => EventTarget[] },
): boolean {
  if (target instanceof Element && isReaderInteractiveElement(target)) return true;

  const path =
    event && typeof event.composedPath === 'function'
      ? event.composedPath()
      : null;
  if (path) {
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      if (n instanceof Element && isReaderInteractiveElement(n)) return true;
      // 到 viewport 为止即可，避免走过半个 Document
      if (n instanceof Element && n.classList?.contains('reader-turn-viewport')) break;
    }
  }

  if (target instanceof Node && !(target instanceof Element)) {
    const parent = target.parentElement;
    if (parent && isReaderInteractiveElement(parent)) return true;
  }
  return false;
}

/**
 * 十字邻点命中：偏触仍识别词典/按钮。
 * 只查中心 + 上下左右，共 5 次 elementFromPoint。
 */
export function hitTestsReaderInteractive(clientX: number, clientY: number): boolean {
  if (typeof document === 'undefined') return false;
  const r = INTERACTIVE_HIT_RADIUS;
  const points: Array<[number, number]> = [
    [clientX, clientY],
    [clientX, clientY - r],
    [clientX, clientY + r],
    [clientX - r, clientY],
    [clientX + r, clientY],
  ];
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    const el = document.elementFromPoint(x, y);
    if (el && isReaderInteractiveElement(el)) return true;
  }
  return false;
}

/** 翻页 begin 前：事件目标或邻点任一侧为交互则让路 */
export function shouldYieldPageTurn(
  target: EventTarget | null,
  clientX: number,
  clientY: number,
  event?: Event,
): boolean {
  if (isReaderInteractiveEventTarget(target, event)) return true;
  return hitTestsReaderInteractive(clientX, clientY);
}
