'use client';

import { useCallback, useEffect, useRef } from 'react';
import { SHEET_OPEN_GUARD_MS } from '@/lib/reader_gesture';

/**
 * 半屏打开后短窗忽略遮罩点击，避免 TWA 同按压 pointerdown 开层 + click 关层。
 * 关闭按钮 / 明确 API 仍可立即关（不走 guardedClose）。
 */
export function useSheetOpenGuard(ms: number = SHEET_OPEN_GUARD_MS) {
  const openedAt = useRef(0);

  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  const canClose = useCallback(() => Date.now() - openedAt.current >= ms, [ms]);

  const guardedClose = useCallback(
    (onClose: () => void) => {
      if (!canClose()) return;
      onClose();
    },
    [canClose],
  );

  return { canClose, guardedClose, openedAt };
}
