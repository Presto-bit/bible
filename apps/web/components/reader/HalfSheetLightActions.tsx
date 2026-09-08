'use client';

import { useState } from 'react';
import { Pressable } from '@/components/ui/Pressable';

export function HalfSheetLightActions({
  copied,
  saved,
  showSources,
  onCopy,
  onSaveThought,
  onOpenSources,
  onShare,
}: {
  copied?: boolean;
  saved?: boolean;
  showSources?: boolean;
  onCopy: () => void;
  onSaveThought: () => void;
  onOpenSources?: () => void;
  onShare?: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="half-sheet-light-actions">
      <Pressable className="half-sheet-light-action" onTap={onCopy}>
        {copied ? '已复制' : '复制'}
      </Pressable>
      <span className="half-sheet-light-sep" aria-hidden>
        ·
      </span>
      <Pressable className="half-sheet-light-action" onTap={onSaveThought}>
        {saved ? '已存想法' : '存想法'}
      </Pressable>
      {showSources && onOpenSources ? (
        <>
          <span className="half-sheet-light-sep" aria-hidden>
            ·
          </span>
          <Pressable className="half-sheet-light-action" onTap={onOpenSources}>
            看来源
          </Pressable>
        </>
      ) : null}
      {onShare ? (
        <>
          <span className="half-sheet-light-sep" aria-hidden>
            ·
          </span>
          <div className="half-sheet-light-more">
            <Pressable
              className="half-sheet-light-action"
              onTap={() => setMoreOpen((v) => !v)}
            >
              ⋯
            </Pressable>
            {moreOpen ? (
              <div className="half-sheet-light-more-menu">
                <Pressable
                  className="half-sheet-light-action"
                  onTap={() => {
                    setMoreOpen(false);
                    onShare();
                  }}
                >
                  分享
                </Pressable>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
