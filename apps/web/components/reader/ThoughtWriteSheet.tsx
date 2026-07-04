'use client';

import { useEffect, useRef, useState } from 'react';
import { refToChineseLabel } from '@/lib/ref_label';

/** 键盘顶起底部 sheet，避免输入框与发布按钮被遮挡 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const next = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setInset(next > 40 ? next : 0);
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    sync();
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  return inset;
}

export default function ThoughtWriteSheet({
  refLabel,
  verseText,
  onPublish,
  onClose,
}: {
  refLabel: string;
  verseText?: string;
  onPublish: (body: string) => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const kbInset = useKeyboardInset();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cnRef = refToChineseLabel(refLabel) ?? refLabel;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (kbInset <= 0) return;
    const t = window.setTimeout(() => {
      inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [kbInset]);

  return (
    <div
      className="sheet-backdrop thought-write-backdrop"
      onClick={onClose}
      style={{ paddingBottom: kbInset }}
    >
      <div
        className="sheet card thought-write-sheet"
        onClick={(e) => e.stopPropagation()}
        style={
          kbInset > 0
            ? { maxHeight: `calc(100dvh - ${kbInset}px - 8px)` }
            : undefined
        }
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>写想法</strong>
          <button type="button" className="text-link" onClick={onClose}>关闭</button>
        </div>

        <div className="thought-write-scroll">
          <div className="thought-verse-card">
            <span className="thought-verse-label">所选经文</span>
            <strong className="thought-verse-ref">{cnRef}</strong>
            {verseText ? (
              <p className="thought-verse-text">{verseText}</p>
            ) : (
              <p className="muted thought-verse-text">（未选中具体经文内容）</p>
            )}
          </div>

          <p className="muted" style={{ fontSize: 12, margin: '10px 0' }}>
            想法将公开给读同一节经文的人
          </p>
          <textarea
            ref={inputRef}
            className="note-editor-input"
            rows={4}
            autoFocus
            enterKeyHint="done"
            placeholder="写下你的领受、疑问或祷告…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => {
              window.setTimeout(() => {
                inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }, 280);
            }}
          />
        </div>

        <div className="thought-write-actions">
          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginTop: 0 }}
            onClick={() => {
              const t = body.trim();
              if (!t) return;
              onPublish(t);
            }}
          >
            发布
          </button>
        </div>
      </div>
    </div>
  );
}
