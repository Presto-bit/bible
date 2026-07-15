'use client';

import type { ComponentProps } from 'react';
import { GroupComposer, type ComposerMode } from './GroupComposer';

type ComposerProps = ComponentProps<typeof GroupComposer>;

type Props = ComposerProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: ComposerMode;
};

const TITLE: Record<ComposerMode, string> = {
  chat: '发消息',
  checkin: '打卡',
  task: '发布任务',
  plan: '群计划',
};

export function GroupComposerSheet({
  open,
  onOpenChange,
  mode = 'checkin',
  ...composerProps
}: Props) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop group-composer-backdrop" onClick={() => onOpenChange(false)}>
      <div
        className="sheet card group-composer-sheet group-composer-sheet-slim"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0, marginBottom: 8 }}>
          <strong>{TITLE[mode]}</strong>
          <button type="button" className="text-link" onClick={() => onOpenChange(false)}>
            关闭
          </button>
        </div>
        <GroupComposer {...composerProps} forcedMode={mode} />
      </div>
    </div>
  );
}
