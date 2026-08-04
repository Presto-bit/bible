'use client';

import type { ReactNode } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { Pressable } from '@/components/ui/Pressable';
import { useSheetOpenGuard } from '@/lib/use_sheet_open_guard';

/**
 * 小爱历史侧栏。
 * 开层用 openGuard：TWA 上 pointerdown 开层后同一次 click 会打到遮罩，表现为「点了没弹窗」。
 */
export default function AssistantHistoryDrawer({
  onClose,
  onNewSession,
  children,
}: {
  onClose: () => void;
  onNewSession: () => void;
  children: ReactNode;
}) {
  const { guardedClose } = useSheetOpenGuard();

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div
        className="drawer-backdrop"
        data-dismiss-on-tab-nav
        role="presentation"
        onClick={() => guardedClose(onClose)}
        onPointerUp={(e) => {
          // 同按压周期的 pointerup 也可能落在刚挂上的遮罩上
          if (e.target === e.currentTarget) guardedClose(onClose);
        }}
      >
        <div
          className="drawer-left assistant-history-drawer"
          onClick={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="历史会话"
        >
          <div className="section-row" style={{ marginTop: 0 }}>
            <strong>历史会话</strong>
            <Pressable className="btn" style={{ marginTop: 0 }} onTap={onNewSession}>
              + 新会话
            </Pressable>
            <Pressable
              className="assistant-history-head-close"
              aria-label="关闭历史会话"
              onTap={onClose}
            >
              ×
            </Pressable>
          </div>
          {children}
          <p className="muted assistant-history-retention-hint">为你保留最近30天历史</p>
        </div>
      </div>
    </AppBodyPortal>
  );
}
