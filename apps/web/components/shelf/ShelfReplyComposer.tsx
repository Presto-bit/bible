'use client';

import { useCallback, useState } from 'react';
import { useKeyboardInset } from '@/components/reader/useKeyboardInset';
import { ensureAccountReady, getSessionToken } from '@/lib/api';
import ShelfInlineComposer from '@/components/shelf/ShelfInlineComposer';

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
    <div
      className="shelf-composer-footer"
      style={{ paddingBottom: kbInset ? Math.max(0, kbInset - 8) : undefined }}
    >
      <ShelfInlineComposer
        value={body}
        onChange={setBody}
        onSubmit={submit}
        placeholder={placeholder}
        maxLength={maxLength}
        submitLabel="发送"
        disabled={disabled}
        busy={busy}
        rows={1}
      />
    </div>
  );
}
