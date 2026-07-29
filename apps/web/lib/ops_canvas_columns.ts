/** 活动编辑三栏（搭内容/发布条件 · 实时预览 · 页面结构）宽度拖拽 */

export type OpsCanvasCols = { left: number; mid: number; right: number };

const STORAGE_KEY = 'ops-canvas-cols-v3';
const GAP = 8;

export const OPS_COL_MIN = { left: 240, mid: 200, right: 240 } as const;
export const OPS_COL_DEFAULT: OpsCanvasCols = { left: 360, mid: 320, right: 360 };

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
        let overflow = sum - avail;
        // 优先压缩中间预览，再左栏，尽量保住右侧「页面结构」宽度
        const midCut = Math.min(overflow, mid - OPS_COL_MIN.mid);
        mid -= midCut;
        overflow -= midCut;
        if (overflow > 0) {
          const leftCut = Math.min(overflow, left - OPS_COL_MIN.left);
          left -= leftCut;
          overflow -= leftCut;
        }
        if (overflow > 0) {
          right = Math.max(OPS_COL_MIN.right, right - overflow);
        }
      } else if (sum < avail) {
        // 多余空间优先补给页面结构（右栏）
        right += avail - sum;
      }
    }
  }
  return { left, mid, right };
}

/** edge 0：调 left|mid；edge 1：调 mid|right（可再从 left 借宽给 right） */
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

  // 分隔条右移：预览变宽、结构变窄；左移：结构变宽（可继续从左栏借宽）
  let left = start.left;
  let mid = start.mid + dx;
  let right = start.right - dx;

  if (mid < OPS_COL_MIN.mid) {
    const deficit = OPS_COL_MIN.mid - mid;
    mid = OPS_COL_MIN.mid;
    const fromLeft = Math.min(deficit, left - OPS_COL_MIN.left);
    left -= fromLeft;
    const still = deficit - fromLeft;
    if (still > 0) right = Math.max(OPS_COL_MIN.right, right - still);
  }
  if (right < OPS_COL_MIN.right) {
    const deficit = OPS_COL_MIN.right - right;
    right = OPS_COL_MIN.right;
    mid = Math.max(OPS_COL_MIN.mid, mid - deficit);
  }
  if (left < OPS_COL_MIN.left) {
    const deficit = OPS_COL_MIN.left - left;
    left = OPS_COL_MIN.left;
    mid = Math.max(OPS_COL_MIN.mid, mid - deficit);
  }

  return clampCols({ left, mid, right }, containerWidth);
}

export function opsCanvasGridStyle(cols: OpsCanvasCols): {
  gridTemplateColumns: string;
} {
  return {
    gridTemplateColumns: `${cols.left}px ${GAP}px ${cols.mid}px ${GAP}px ${cols.right}px`,
  };
}
