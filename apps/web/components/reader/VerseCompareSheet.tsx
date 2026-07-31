'use client';

import { useEffect, useRef, useState } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
import AppBodyPortal from '@/components/AppBodyPortal';
import AnswerText from '@/components/AnswerText';
import {
  api,
  chatStream,
  type VerseRendition,
} from '@/lib/api';
import { chipUserQuestion } from '@/lib/assistant_scenes';
import { bodyText } from '@/lib/assistant_format';
import { buildAssistantReaderContext } from '@/lib/assistant_reader_context';
import { FALLBACK_PARALLEL_VERSION, FALLBACK_PRIMARY_VERSION } from '@/lib/bible_version';
import {
  getCompareSecondaryVersion,
  setCompareSecondaryVersion,
} from '@/lib/verse_compare_pref';
import { navigateToAssistant } from '@/lib/assistant_prefill';

type Props = {
  refParam: string;
  refLabel: string;
  selectionText?: string;
  /** 当前主读译本 */
  mainVersionId: string;
  onClose: () => void;
  /** 进入整章上下对照 */
  onOpenChapterParallel: (secondaryVersionId: string) => void;
};

function hasVerseRef(refParam: string): boolean {
  return (
    /\.\d+\.\d+/.test(refParam)
    || /:\d+\s*$/.test(refParam)
    || /:\d+[-–]/.test(refParam)
  );
}

export default function VerseCompareSheet({
  refParam,
  refLabel,
  selectionText,
  mainVersionId,
  onClose,
  onOpenChapterParallel,
}: Props) {
  const primaryId = (mainVersionId || FALLBACK_PRIMARY_VERSION).trim() || FALLBACK_PRIMARY_VERSION;
  const [rows, setRows] = useState<VerseRendition[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(true);
  const [secondaryId, setSecondaryId] = useState(() =>
    getCompareSecondaryVersion(FALLBACK_PARALLEL_VERSION),
  );
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiDone, setAiDone] = useState(false);
  const [aiRetry, setAiRetry] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const primary = rows.find((r) => r.version === primaryId) ?? rows[0] ?? null;
  const others = rows.filter((r) => r.version !== (primary?.version ?? primaryId));
  const secondary =
    others.find((r) => r.version === secondaryId)
    ?? others[0]
    ?? null;

  useEffect(() => {
    if (secondary && secondary.version !== secondaryId) {
      setSecondaryId(secondary.version);
    }
  }, [secondary, secondaryId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCompare(true);
    setLoadErr(null);
    if (!hasVerseRef(refParam)) {
      setLoadErr('请选中具体经节后再打开对照');
      setLoadingCompare(false);
      setRows([]);
      return () => {
        cancelled = true;
      };
    }
    void api
      .compare(refParam)
      .then((d) => {
        if (cancelled) return;
        setRows(d.versions ?? []);
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setLoadErr(
            /400|需指定到节|经节/.test(msg)
              ? '请选中具体经节后再打开对照'
              : msg,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCompare(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refParam]);

  // 等译本就绪后再问小爱，把两本正文注入 reader_context
  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let cancelled = false;
    setAiText('');
    setAiErr(null);
    setAiDone(false);

    if (!hasVerseRef(refParam) || loadingCompare || loadErr) {
      setAiBusy(false);
      if (!loadingCompare) setAiDone(true);
      return () => {
        cancelled = true;
        ac.abort();
      };
    }

    const compareVersions = [primary, secondary]
      .filter((v): v is VerseRendition => Boolean(v?.text?.trim()))
      .map((v) => ({ label: v.label, text: v.text.trim(), version: v.version }));

    // 译本还在加载完但 rows 空：仍可问，只是无对照正文
    setAiBusy(true);
    const timer = window.setTimeout(() => {
      const q = chipUserQuestion('译本对照', refLabel);
      const question =
        selectionText && selectionText.trim().length <= 300
          ? `${q}\n\n选中文本：${selectionText.trim()}`
          : q;
      const baseCtx = buildAssistantReaderContext() || {};
      void chatStream(
        {
          ref: refParam,
          question,
          mode: 'compare',
          scene: 'chat_compare',
          reader_context: {
            ...baseCtx,
            ...(compareVersions.length
              ? { compare_versions: compareVersions }
              : {}),
          },
        },
        {
          onDelta: (t) => {
            if (cancelled) return;
            setAiText((prev) => prev + t);
          },
          onError: (m) => {
            if (cancelled) return;
            setAiErr(m);
            setAiBusy(false);
          },
          onDone: () => {
            if (cancelled) return;
            setAiDone(true);
            setAiBusy(false);
          },
        },
        { signal: ac.signal },
      ).finally(() => {
        if (!cancelled) setAiBusy(false);
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ac.abort();
    };
    // secondary.version：换对照本后重新解读
  }, [
    refParam,
    refLabel,
    selectionText,
    aiRetry,
    loadingCompare,
    loadErr,
    primary?.version,
    primary?.text,
    secondary?.version,
    secondary?.text,
  ]);

  const pickSecondary = (id: string) => {
    setSecondaryId(id);
    setCompareSecondaryVersion(id);
  };

  const aiBody = bodyText(aiText).trim();
  const primaryText = primary?.text?.trim() || selectionText?.trim() || '';

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div
          className="sheet card verse-compare-sheet"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={`对照 ${refLabel}`}
        >
          <div className="section-row" style={{ marginTop: 0 }}>
            <strong>对照 · {refLabel}</strong>
            <SheetCloseButton onClick={onClose} />
          </div>

          <div className="verse-compare-scroll">
            {loadingCompare ? (
              <p className="muted">加载经文…</p>
            ) : loadErr ? (
              <p className="verse-compare-err">{loadErr}</p>
            ) : primaryText ? (
              <section className="verse-compare-block">
                <p className="verse-compare-ver-label">
                  {primary?.label || '当前译本'}
                </p>
                <p className="verse-compare-text">{primaryText}</p>
              </section>
            ) : (
              <p className="muted">暂无经文</p>
            )}

            {!loadErr ? (
              <section className="verse-compare-block">
                <p className="verse-compare-section-title">小爱解读</p>
                {aiBusy && !aiBody ? (
                  <p className="muted" style={{ fontSize: 13 }}>小爱正在整理白话对照…</p>
                ) : null}
                {aiErr && !aiBody ? (
                  <div>
                    <p className="verse-compare-err">{aiErr}</p>
                    <button
                      type="button"
                      className="font-pill"
                      style={{ marginTop: 8 }}
                      onClick={() => setAiRetry((n) => n + 1)}
                    >
                      重试
                    </button>
                  </div>
                ) : null}
                {aiBody ? (
                  <div className="verse-compare-ai">
                    <AnswerText text={aiBody} dense />
                  </div>
                ) : null}
                {!aiBusy && !aiErr && !aiBody && aiDone && !loadingCompare ? (
                  <p className="muted" style={{ fontSize: 13 }}>暂无解读，请稍后重试。</p>
                ) : null}
              </section>
            ) : null}

            {!loadErr && rows.length > 0 ? (
              <section className="verse-compare-block">
                <button
                  type="button"
                  className="verse-compare-fold-toggle"
                  aria-expanded={versionsOpen}
                  onClick={() => setVersionsOpen((v) => !v)}
                >
                  {versionsOpen ? '收起各译本全文' : '查看各译本全文'}
                </button>
                {versionsOpen ? (
                  <div className="verse-compare-fold-body">
                    {others.length > 1 ? (
                      <div className="verse-compare-ver-chips" role="listbox" aria-label="换对照译本">
                        {others.map((v) => (
                          <button
                            key={v.version}
                            type="button"
                            role="option"
                            aria-selected={secondary?.version === v.version}
                            className={`mode-chip${secondary?.version === v.version ? ' mode-chip-active' : ''}`}
                            onClick={() => pickSecondary(v.version)}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {rows.map((v) => (
                      <div key={v.version} className="verse-compare-fold-row">
                        <p className="verse-compare-ver-label">{v.label}</p>
                        <p className="verse-compare-text verse-compare-text-secondary">{v.text}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <div className="verse-compare-actions">
            {secondary ? (
              <button
                type="button"
                className="font-pill"
                onClick={() => onOpenChapterParallel(secondary.version)}
              >
                整章对照
              </button>
            ) : null}
            <button
              type="button"
              className="font-pill"
              onClick={() => {
                const seed = aiBody
                  ? [
                      {
                        role: 'user' as const,
                        text: chipUserQuestion('译本对照', refLabel),
                        scene: 'chat_compare',
                        sceneLabel: '译本对照',
                      },
                      {
                        role: 'assistant' as const,
                        text: aiBody,
                        scene: 'chat_compare',
                        sceneLabel: '译本对照',
                      },
                    ]
                  : undefined;
                navigateToAssistant(refParam, {
                  question: chipUserQuestion('译本对照', refLabel),
                  autoSend: !aiBody,
                  scene: 'chat_compare',
                  seedMessages: seed,
                });
              }}
            >
              继续问小爱
            </button>
          </div>
          <p className="muted verse-compare-disclaimer">AI 释义，请以圣经正文为准</p>
        </div>
      </div>
    </AppBodyPortal>
  );
}
