'use client';

import { Pressable } from '@/components/ui/Pressable';

export function HalfSheetLightActions({
  copied,
  saved,
  onCopy,
  onSaveThought,
  onShare,
}: {
  copied?: boolean;
  saved?: boolean;
  onCopy: () => void;
  onSaveThought: () => void;
  onShare?: () => void;
}) {
  return (
    <div className="half-sheet-light-actions">
      <Pressable className="half-sheet-light-action" onTap={onCopy}>
        {copied ? '已复制' : '复制'}
      </Pressable>
      <span className="half-sheet-light-sep" aria-hidden>
        ·
      </span>
      <Pressable className="half-sheet-light-action" onTap={onSaveThought}>
        {saved ? '已存笔记' : '存笔记'}
      </Pressable>
      {onShare ? (
        <>
          <span className="half-sheet-light-sep" aria-hidden>
            ·
          </span>
          <Pressable className="half-sheet-light-action" onTap={onShare}>
            分享
          </Pressable>
        </>
      ) : null}
    </div>
  );
}
