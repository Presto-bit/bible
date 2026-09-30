'use client';

import { useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useToast } from '@/components/ui/ToastProvider';
import { confirmPlatformToc, type ShelfTocItem } from '@/lib/shelf_api';
import { shellTapProps } from '@/lib/shell_tap';

type Props = {
  bookId: string;
  bookTitle: string;
  suggested: ShelfTocItem[];
  onDone: () => void;
  onClose: () => void;
};

/** 导入后目录确认：可应用建议切点，或保持整本一节。 */
export default function ShelfTocConfirmSheet({
  bookId,
  bookTitle,
  suggested,
  onDone,
  onClose,
}: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const cuts = suggested.filter((x) => (x.title || '').trim());

  const run = async (applySuggested: boolean) => {
    setBusy(true);
    try {
      await confirmPlatformToc(bookId, { applySuggested });
      toast(applySuggested ? '已按建议生成目录' : '已保持整本一节');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : '确认失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppBodyPortal>
      <div className="shelf-sheet-backdrop" onClick={busy ? undefined : onClose} role="presentation" />
      <div className="shelf-import-sheet" role="dialog" aria-modal="true" aria-label="确认目录">
        <div className="shelf-import-head">
          <strong>确认目录</strong>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭"
            disabled={busy}
            {...shellTapProps({ onTap: onClose })}
          >
            ✕
          </button>
        </div>
        <p className="shelf-import-hint muted">
          「{bookTitle}」未识别到可靠样式目录。检测到 {cuts.length} 个建议切点；可应用建议，或先整本一节稍后再整理。
        </p>
        {cuts.length > 0 ? (
          <ul className="shelf-toc-suggest-list" style={{ margin: '0 0 16px', padding: '0 4px', listStyle: 'none' }}>
            {cuts.slice(0, 16).map((c) => (
              <li
                key={c.id}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid color-mix(in srgb, var(--ink, #2a241c) 8%, transparent)',
                  fontSize: 14,
                }}
              >
                {c.title}
                {typeof c.confidence === 'number' ? (
                  <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                    建议
                  </span>
                ) : null}
              </li>
            ))}
            {cuts.length > 16 ? (
              <li className="muted" style={{ paddingTop: 8, fontSize: 12 }}>
                另有 {cuts.length - 16} 项…
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="shelf-import-confirm-actions">
          <button
            type="button"
            className="btn ghost shelf-import-btn"
            disabled={busy}
            {...shellTapProps({ onTap: () => void run(false) })}
          >
            保持整本一节
          </button>
          <button
            type="button"
            className={`btn primary shelf-import-btn${busy || cuts.length < 2 ? ' is-disabled' : ''}`}
            disabled={busy || cuts.length < 2}
            {...shellTapProps({ onTap: () => void run(true) })}
          >
            {busy ? '处理中…' : '应用建议目录'}
          </button>
        </div>
      </div>
    </AppBodyPortal>
  );
}
