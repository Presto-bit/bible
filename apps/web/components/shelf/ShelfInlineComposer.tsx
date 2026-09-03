'use client';

import { useCallback, type CSSProperties } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  placeholder?: string;
  maxLength?: number;
  submitLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  rows?: number;
  className?: string;
  style?: CSSProperties;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
};

export default function ShelfInlineComposer({
  value,
  onChange,
  onSubmit,
  placeholder = '写点什么…',
  maxLength,
  submitLabel = '发送',
  disabled,
  busy,
  rows = 2,
  className,
  style,
  inputRef,
}: Props) {
  const canSubmit = value.trim().length > 0 && !disabled && !busy;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    void onSubmit();
  }, [canSubmit, onSubmit]);

  return (
    <div
      className={['shelf-inline-composer', className].filter(Boolean).join(' ')}
      style={style}
    >
      <textarea
        ref={inputRef}
        className="shelf-inline-composer-input"
        rows={rows}
        enterKeyHint="send"
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        disabled={disabled || busy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="button"
        className="shelf-inline-composer-send"
        disabled={!canSubmit}
        aria-label={submitLabel}
        onClick={submit}
      >
        {submitLabel}
      </button>
    </div>
  );
}
