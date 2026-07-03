'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type PasswordSheetOptions = {
  title?: string;
  needCurrent?: boolean;
  onSubmit: (current: string | null, next: string) => Promise<void>;
};

type PasswordState = PasswordSheetOptions & {
  resolve: (ok: boolean) => void;
};

const PasswordContext = createContext<((opts: PasswordSheetOptions) => Promise<boolean>) | null>(null);

export function usePasswordSheet() {
  const fn = useContext(PasswordContext);
  if (!fn) {
    return async (opts: PasswordSheetOptions) => {
      const old = opts.needCurrent ? prompt('请输入当前密码：') : null;
      if (opts.needCurrent && old === null) return false;
      const next = prompt('请输入新密码（≥6 位）：');
      if (next === null || next.length < 6) return false;
      try {
        await opts.onSubmit(old, next);
        return true;
      } catch {
        return false;
      }
    };
  }
  return fn;
}

export function PasswordSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PasswordState | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = useCallback((opts: PasswordSheetOptions) => {
    return new Promise<boolean>((resolve) => {
      setCurrent('');
      setNext('');
      setConfirm('');
      setShow(false);
      setErr(null);
      setState({ ...opts, resolve });
    });
  }, []);

  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  const submit = async () => {
    if (!state) return;
    if (state.needCurrent && !current) {
      setErr('请输入当前密码');
      return;
    }
    if (next.length < 6) {
      setErr('新密码至少 6 位');
      return;
    }
    if (next !== confirm) {
      setErr('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await state.onSubmit(state.needCurrent ? current : null, next);
      state.resolve(true);
      setState(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PasswordContext.Provider value={open}>
      {children}
      {state ? (
        <div className="sheet-backdrop" onClick={() => close(false)}>
          <div className="sheet card password-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{state.title ?? '修改密码'}</h3>
            {state.needCurrent ? (
              <input
                className="book-chip"
                type={show ? 'text' : 'password'}
                style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
                placeholder="当前密码"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            ) : null}
            <input
              className="book-chip"
              type={show ? 'text' : 'password'}
              style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
              placeholder="新密码（≥6 位）"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <input
              className="book-chip"
              type={show ? 'text' : 'password'}
              style={{ width: '100%', textAlign: 'left', marginBottom: 8 }}
              placeholder="确认新密码"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <label className="muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              显示密码
            </label>
            {err ? <p style={{ color: '#b1554a', fontSize: 13 }}>{err}</p> : null}
            <div className="confirm-sheet-actions">
              <button type="button" className="font-pill" disabled={busy} onClick={() => close(false)}>取消</button>
              <button type="button" className="btn" disabled={busy} onClick={() => void submit()}>
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PasswordContext.Provider>
  );
}
