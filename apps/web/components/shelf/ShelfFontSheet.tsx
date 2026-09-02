'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import {
  SHELF_FONT_STEPS,
  SHELF_LINE_HEIGHT_STEPS,
  setShelfFontPx,
  setShelfLineHeight,
} from '@/lib/shelf_reading';

type Props = {
  open: boolean;
  fontPx: number;
  lineHeight: number;
  onClose: () => void;
  onFontChange: (px: number) => void;
  onLineHeightChange: (value: number) => void;
};

export default function ShelfFontSheet({
  open,
  fontPx,
  lineHeight,
  onClose,
  onFontChange,
  onLineHeightChange,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="shelf-font-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="字体设置"
      onClick={onClose}
    >
      <div className="shelf-font-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shelf-font-head">
          <strong>字体</strong>
          <SheetCloseButton onClick={onClose} />
        </div>
        <div className="shelf-font-body">
          <p className="shelf-font-label">字号</p>
          <div className="font-pills">
            {SHELF_FONT_STEPS.map((step) => (
              <button
                key={step.px}
                type="button"
                className={`font-pill ${fontPx === step.px ? 'font-pill-active' : ''}`}
                onClick={() => {
                  setShelfFontPx(step.px);
                  onFontChange(step.px);
                }}
              >
                {step.label}
              </button>
            ))}
          </div>
          <p className="shelf-font-label">行间距</p>
          <div className="font-pills">
            {SHELF_LINE_HEIGHT_STEPS.map((step) => (
              <button
                key={step.value}
                type="button"
                className={`font-pill ${lineHeight === step.value ? 'font-pill-active' : ''}`}
                onClick={() => {
                  setShelfLineHeight(step.value);
                  onLineHeightChange(step.value);
                }}
              >
                {step.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
