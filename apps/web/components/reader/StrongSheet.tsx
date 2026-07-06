'use client';

import { useEffect, useState } from 'react';
import PageBackBar, { SheetCloseButton } from '@/components/PageBackBar';
import { api, type StrongsWord } from '@/lib/api';

export function StrongSheet({
  refParam,
  refLabel,
  onClose,
}: {
  refParam: string;
  refLabel: string;
  onClose: () => void;
}) {
  const [words, setWords] = useState<StrongsWord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api.strongs(refParam)
      .then((d) => {
        if (!cancelled) setWords(d.words || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refParam]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <PageBackBar variant="sheet" onClick={onClose} label="返回" />
          <strong>希腊原文 · {refLabel}</strong>
          <SheetCloseButton onClick={onClose} />
        </div>
        <p className="muted reader-tools-hint">
          逐词列出该节新约希腊文、Strong&apos;s 编号、词形与简要英文/中文释义，便于查考原文用词。
          目前覆盖新约希腊文语料；旧约希伯来文将陆续补充。
        </p>
        {loading ? (
          <p className="muted">加载中…</p>
        ) : words.length === 0 ? (
          <p className="muted">暂无该节原文数据（多为旧约经节或数据未就绪）。</p>
        ) : (
          <div className="reader-tools-list">
            {words.map((w) => (
              <div key={w.position} className="reader-tools-item static">
                <strong>{w.word}</strong>
                {w.strongs ? <span className="muted"> · {w.strongs}</span> : null}
                {w.transliteration ? <span className="muted"> · {w.transliteration}</span> : null}
                {w.morphology ? <span className="muted"> · {w.morphology}</span> : null}
                {w.gloss ? <p style={{ margin: '4px 0 0', fontSize: 13 }}>{w.gloss}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
