/** 同一时刻只允许一行左滑展开；新开时自动收起上一行。 */
type Closer = () => void;

let activeClose: Closer | null = null;

export function swipeRevealActivate(close: Closer) {
  if (activeClose && activeClose !== close) {
    try {
      activeClose();
    } catch {
      /* ignore */
    }
  }
  activeClose = close;
}

export function swipeRevealDeactivate(close: Closer) {
  if (activeClose === close) activeClose = null;
}

export function swipeRevealCloseActive() {
  if (!activeClose) return;
  const fn = activeClose;
  activeClose = null;
  try {
    fn();
  } catch {
    /* ignore */
  }
}
