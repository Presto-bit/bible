'use client';

import { useCallback, useState } from 'react';
import { useKeyboardInset } from '@/components/reader/useKeyboardInset';
import { ensureAccountReady, getSessionToken } from '@/lib/api';

export function useShelfLoginGate(flashToast: (msg: string) => void) {
  return useCallback(async () => {
    try {
      await ensureAccountReady();
      if (!getSessionToken()) {
        flashToast('登录后可参与');
        return false;
      }
      return true;
    } catch {
      flashToast('登录后可参与');
      return false;
    }
  }, [flashToast]);
}

export default function ShelfReplyComposer({
  placeholder = '写回复…',
  maxLength = 500,
  disabled,
  onSubmit,
}: {
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  onSubmit: (body: string) => Promise<void> | void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const { inset: kbInset } = useKeyboardInset();

  const submit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || busy || disabled) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setBody('');
    } finally {
      setBusy(false);
    }
  }, [body, busy, disabled, onSubmit]);

  return (
    <div className="shelf-reply-composer" style={{ paddingBottom: kbInset ? Math.max(0, kbInset - 8) : undefined }}>
      <textarea
        className="shelf-reply-input group-composer-text search-input compose-textarea"
        rows={1}
        enterKeyHint="send"
        placeholder={placeholder}
        value={body}
        maxLength={maxLength}
        disabled={disabled || busy}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <button
        type="button"
        className="shelf-reply-send"
        disabled={!body.trim() || busy || disabled}
        onClick={() => void submit()}
      >
        发送
      </button>
    </div>
  );
}
