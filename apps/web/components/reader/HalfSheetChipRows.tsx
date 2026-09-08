'use client';

import { useRef } from 'react';
import { Pressable } from '@/components/ui/Pressable';
import type { HalfSheetChipDef } from '@/lib/half_sheet_chips';

export function HalfSheetChipRows({
  followups,
  followupsLoading,
  l1Chips,
  disabled,
  onFollowup,
  onL1,
}: {
  followups: string[];
  followupsLoading?: boolean;
  l1Chips: HalfSheetChipDef[];
  disabled?: boolean;
  onFollowup: (q: string) => void;
  onL1: (chip: HalfSheetChipDef) => void;
}) {
  const scrollLockRef = useRef(false);
  const scrollUnlockTimerRef = useRef<number | null>(null);

  const markChipTrackScrolled = () => {
    scrollLockRef.current = true;
    if (scrollUnlockTimerRef.current != null) {
      window.clearTimeout(scrollUnlockTimerRef.current);
    }
    scrollUnlockTimerRef.current = window.setTimeout(() => {
      scrollLockRef.current = false;
      scrollUnlockTimerRef.current = null;
    }, 280);
  };

  const handleFollowup = (q: string) => {
    if (disabled || scrollLockRef.current) return;
    onFollowup(q);
  };

  const handleL1 = (chip: HalfSheetChipDef) => {
    if (disabled || scrollLockRef.current) return;
    onL1(chip);
  };

  const showL3 = followupsLoading || followups.length > 0;

  return (
    <div className="half-sheet-chip-zones">
      {showL3 ? (
        <div className="half-sheet-chip-zone half-sheet-chip-zone-l3">
          <p className="half-sheet-chip-zone-label">继续追问</p>
          <div
            className="half-sheet-chip-track"
            role="list"
            onScroll={markChipTrackScrolled}
          >
            {followupsLoading && followups.length === 0
              ? [0, 1].map((i) => (
                  <span key={i} className="half-sheet-chip half-sheet-chip-l3 half-sheet-chip-skeleton" />
                ))
              : followups.map((q) => (
                  <Pressable
                    key={q}
                    className="half-sheet-chip half-sheet-chip-l3"
                    disabled={disabled}
                    onTap={() => handleFollowup(q)}
                  >
                    {q}
                  </Pressable>
                ))}
          </div>
        </div>
      ) : null}

      <div className="half-sheet-chip-zone half-sheet-chip-zone-l1">
        <p className="half-sheet-chip-zone-label">还想了解</p>
        <div
          className="half-sheet-chip-track"
          role="list"
          onScroll={markChipTrackScrolled}
        >
          {l1Chips.map((chip) => (
            <Pressable
              key={chip.label}
              className="half-sheet-chip half-sheet-chip-l1"
              disabled={disabled}
              onTap={() => handleL1(chip)}
            >
              {chip.label}
            </Pressable>
          ))}
        </div>
      </div>
    </div>
  );
}
