'use client';

import { useEffect, useState } from 'react';
import PageBackBar, { SheetCloseButton } from '@/components/PageBackBar';
import { api, type StrongsWord } from '@/lib/api';
import AppBodyPortal from '@/components/AppBodyPortal';

const NT_BOOKS = new Set([
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
  '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN',
  '3JN', 'JUD', 'REV',
]);

function isOtRef(refParam: string): boolean {
  const m = refParam.trim().match(/^([1-3]?[A-Za-z]{2,4})/);
  if (!m) return false;
  return !NT_BOOKS.has(m[1]!.toUpperCase());
}

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
  const ot = isOtRef(refParam);
  const langLabel = ot ? '希伯来原文' : '希腊原文';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.strongs(refParam)
      .then((d) => {
        if (!cancelled) setWords(d.words || []);
      })
      .catch(() => {
        if (!cancelled) setWords([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refParam]);

  const looksHebrew = words.some((w) => /[\u0590-\u05FF]/.test(w.word || ''));

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet card" onClick={(e) => e.stopPropagation()}>
          <div className="section-row" style={{ marginTop: 0 }}>
            <PageBackBar variant="sheet" onClick={onClose} label="返回" />
            <strong>
              {langLabel} · {refLabel}
            </strong>
            <SheetCloseButton onClick={onClose} />
          </div>
          <p className="muted reader-tools-hint">
            {ot
              ? '逐词列出该节希伯来文、Strong\'s 编号、词形与简要释义，便于查考原文用词。'
              : '逐词列出该节希腊文、Strong\'s 编号、词形与简要释义，便于查考原文用词。'}
          </p>
          {loading ? (
            <p className="muted">加载中…</p>
          ) : words.length === 0 ? (
            <p className="muted">
              暂无该节原文数据
              {ot ? '（本节可能尚未收录希伯来逐词；可用小爱解释本节）。' : '（数据未就绪）。'}
            </p>
          ) : (
            <div className={`reader-tools-list${looksHebrew ? ' strongs-hebrew' : ''}`}>
              {words.map((w) => (
                <div key={w.position} className="reader-tools-item static">
                  <strong className={looksHebrew ? 'strongs-lemma-he' : undefined}>{w.word}</strong>
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
    </AppBodyPortal>
  );
}
