/** 活动编辑三栏（搭内容/发布条件 · 实时预览 · 页面结构）宽度拖拽 */

export type OpsCanvasCols = { left: number; mid: number; right: number };

const STORAGE_KEY = 'ops-canvas-cols-v2';
const GAP = 8;

export const OPS_COL_MIN = { left: 260, mid: 260, right: 220 } as const;
export const OPS_COL_DEFAULT: OpsCanvasCols = { left: 380, mid: 340, right: 300 };

export function loadOpsCanvasCols(): OpsCanvasCols {
  if (typeof window === 'undefined') return OPS_COL_DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return OPS_COL_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<OpsCanvasCols>;
    return clampCols({
      left: Number(parsed.left) || OPS_COL_DEFAULT.left,
      mid: Number(parsed.mid) || OPS_COL_DEFAULT.mid,
      right: Number(parsed.right) || OPS_COL_DEFAULT.right,
    });
  } catch {
    return OPS_COL_DEFAULT;
  }
}

export function saveOpsCanvasCols(cols: OpsCanvasCols): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clampCols(cols)));
  } catch {
    /* ignore */
  }
}

export function clampCols(cols: OpsCanvasCols, containerWidth?: number): OpsCanvasCols {
  let { left, mid, right } = cols;
  left = Math.max(OPS_COL_MIN.left, Math.round(left));
  mid = Math.max(OPS_COL_MIN.mid, Math.round(mid));
  right = Math.max(OPS_COL_MIN.right, Math.round(right));

  if (containerWidth && containerWidth > 0) {
    const avail = containerWidth - GAP * 2;
    if (avail >= OPS_COL_MIN.left + OPS_COL_MIN.mid + OPS_COL_MIN.right) {
      let sum = left + mid + right;
      if (sum > avail) {
        const overflow = sum - avail;
        // 优先压缩中间，再左右
        const midCut = Math.min(overflow, mid - OPS_COL_MIN.mid);
        mid -= midCut;
        let rest = overflow - midCut;
        if (rest > 0) {
          const leftCut = Math.min(Math.ceil(rest / 2), left - OPS_COL_MIN.left);
          left -= leftCut;
          rest -= leftCut;
        }
        if (rest > 0) {
          right = Math.max(OPS_COL_MIN.right, right - rest);
        }
      }
    }
  }
  return { left, mid, right };
}

/** edge 0：调 left|mid；edge 1：调 mid|right */
export function applyOpsColDrag(
  start: OpsCanvasCols,
  edge: 0 | 1,
  dx: number,
  containerWidth?: number,
): OpsCanvasCols {
  if (edge === 0) {
    const maxLeft = start.left + start.mid - OPS_COL_MIN.mid;
    const left = Math.min(maxLeft, Math.max(OPS_COL_MIN.left, start.left + dx));
    const mid = start.left + start.mid - left;
    return clampCols({ left, mid, right: start.right }, containerWidth);
  }
  const maxMid = start.mid + start.right - OPS_COL_MIN.right;
  const mid = Math.min(maxMid, Math.max(OPS_COL_MIN.mid, start.mid + dx));
  const right = start.mid + start.right - mid;
  return clampCols({ left: start.left, mid, right }, containerWidth);
}

export function opsCanvasGridStyle(cols: OpsCanvasCols): {
  gridTemplateColumns: string;
} {
  return {
    gridTemplateColumns: `${cols.left}px ${GAP}px ${cols.mid}px ${GAP}px ${cols.right}px`,
  };
}