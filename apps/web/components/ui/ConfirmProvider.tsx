'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmState = ConfirmOptions & {
  resolve: (v: boolean) => void;
};

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    return (opts: ConfirmOptions) =>
      Promise.resolve(window.confirm(`${opts.title}\n\n${opts.message}`));
  }
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state ? (
        <div className="sheet-backdrop" onClick={() => close(false)}>
          <div className="sheet card confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{state.title}</h3>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>{state.message}</p>
            <div className="confirm-sheet-actions">
              <button type="button" className="font-pill" onClick={() => close(false)}>
                {state.cancelLabel ?? '取消'}
              </button>
              <button
                type="button"
                className={`btn${state.danger ? ' btn-danger' : ''}`}
                onClick={() => close(true)}
              >
                {state.confirmLabel ?? '确定'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
