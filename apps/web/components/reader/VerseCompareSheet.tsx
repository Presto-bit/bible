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
import { FALLBACK_PARALLEL_VERSION, FALLBACK_PRIMARY_VERSION } from '@/lib/bible_version';
import { pickStrongsHighlights, type StrongsHighlight } from '@/lib/strongs_highlights';
import {
  getCompareSecondaryVersion,
  setCompareSecondaryVersion,
} from '@/lib/verse_compare_pref';
import {
  diffVerseTexts,
  renderTextWithDiffSpans,
  sameScriptRoughly,
} from '@/lib/verse_diff';
import { navigateToAssistant } from '@/lib/assistant_prefill';

type Props = {
  refParam: string;
  refLabel: string;
  selectionText?: string;
  /** 当前主读译本 */
  mainVersionId: string;
  onClose: () => void;
  onOpenStrongs: () => void;
  /** 进入整章上下对照 */
  onOpenChapterParallel: (secondaryVersionId: string) => void;
};

function DiffText({ spans }: { spans: ReturnType<typeof renderTextWithDiffSpans> }) {
  return (
    <>
      {spans.map((p) =>
        p.diff ? (
          <mark key={p.key} className="verse-diff-mark">{p.text}</mark>
        ) : (
          <span key={p.key}>{p.text}</span>
        ),
      )}
    </>
  );
}

export default function VerseCompareSheet({
  refParam,
  refLabel,
  selectionText,
  mainVersionId,
  onClose,
  onOpenStrongs,
  onOpenChapterParallel,
}: Props) {
  const primaryId = (mainVersionId || FALLBACK_PRIMARY_VERSION).trim() || FALLBACK_PRIMARY_VERSION;
  const [rows, setRows] = useState<VerseRendition[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(true);
  const [secondaryId, setSecondaryId] = useState(() =>
    getCompareSecondaryVersion(FALLBACK_PARALLEL_VERSION),
  );
  const [highlights, setHighlights] = useState<StrongsHighlight[]>([]);
  const [strongsLoading, setStrongsLoading] = useState(true);
  const [hasStrongsData, setHasStrongsData] = useState(false);
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
    void api
      .compare(refParam)
      .then((d) => {
        if (cancelled) return;
        setRows(d.versions ?? []);
      })
      .catch((e) => {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingCompare(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refParam]);

  useEffect(() => {
    let cancelled = false;
    setStrongsLoading(true);
    void api
      .strongs(refParam)
      .then((d) => {
        if (cancelled) return;
        const words = d.words ?? [];
        setHasStrongsData(words.length > 0);
        setHighlights(pickStrongsHighlights(words, 4));
      })
      .catch(() => {
        if (!cancelled) {
          setHasStrongsData(false);
          setHighlights([]);
        }
      })
      .finally(() => {
        if (!cancelled) setStrongsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refParam]);

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let cancelled = false;
    setAiText('');
    setAiErr(null);
    setAiDone(false);
    setAiBusy(true);

    const timer = window.setTimeout(() => {
      const q = chipUserQuestion('译本对照', refLabel);
      const question =
        selectionText && selectionText.trim().length <= 300
          ? `${q}\n\n选中文本：${selectionText.trim()}`
          : q;
      void chatStream(
        {
          ref: refParam,
          question,
          mode: 'compare',
          scene: 'chat_compare',
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
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [refParam, refLabel, selectionText, aiRetry]);

  const pickSecondary = (id: string) => {
    setSecondaryId(id);
    setCompareSecondaryVersion(id);
  };

  const primaryText = primary?.text ?? '';
  const secondaryText = secondary?.text ?? '';
  const canDiff =
    Boolean(primaryText && secondaryText)
    && sameScriptRoughly(primaryText, secondaryText);
  const diff = canDiff ? diffVerseTexts(primaryText, secondaryText) : null;
  const primaryParts = diff
    ? renderTextWithDiffSpans(primaryText, diff.main)
    : [{ key: 'all', text: primaryText, diff: false }];
  const secondaryParts = diff
    ? renderTextWithDiffSpans(secondaryText, diff.parallel)
    : [{ key: 'all', text: secondaryText, diff: false }];

  const aiBody = bodyText(aiText).trim();
  const versionOptions = others;

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
              <p className="muted">加载译本…</p>
            ) : loadErr ? (
              <p className="verse-compare-err">{loadErr}</p>
            ) : !primary ? (
              <p className="muted">暂无对照经文</p>
            ) : (
              <>
                <section className="verse-compare-block">
                  <p className="verse-compare-ver-label">
                    {primary.label}
                    <span className="muted"> · 当前</span>
                  </p>
                  <p className="verse-compare-text">
                    {diff?.heavy ? (
                      <span className="verse-diff-heavy">{primaryText}</span>
                    ) : (
                      <DiffText spans={primaryParts} />
                    )}
                  </p>
                </section>

                {secondary ? (
                  <section className="verse-compare-block">
                    <p className="verse-compare-ver-label">{secondary.label}</p>
                    <p className="verse-compare-text verse-compare-text-secondary">
                      {diff?.heavy ? (
                        <span className="verse-diff-heavy">{secondaryText}</span>
                      ) : (
                        <DiffText spans={secondaryParts} />
                      )}
                    </p>
                  </section>
                ) : null}

                {versionOptions.length > 1 ? (
                  <div className="verse-compare-ver-chips" role="listbox" aria-label="换对照译本">
                    {versionOptions.map((v) => (
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
              </>
            )}

            <section className="verse-compare-block">
              <p className="verse-compare-section-title">原文要点</p>
              {strongsLoading ? (
                <p className="muted" style={{ fontSize: 13 }}>加载原文…</p>
              ) : highlights.length > 0 ? (
                <ul className="verse-compare-strongs">
                  {highlights.map((h) => (
                    <li key={`${h.position}-${h.strongs || h.word}`}>
                      <strong className={/[\u0590-\u05FF]/.test(h.word) ? 'strongs-lemma-he' : undefined}>
                        {h.word}
                      </strong>
                      {h.transliteration ? (
                        <span className="muted"> {h.transliteration}</span>
                      ) : null}
                      {h.strongs ? <span className="muted"> · {h.strongs}</span> : null}
                      {h.gloss ? <span className="verse-compare-gloss"> — {h.gloss}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ fontSize: 13 }}>
                  {hasStrongsData
                    ? '暂无可提炼的关键词，可查看逐词。'
                    : '本节暂无逐词原文数据'}
                </p>
              )}
              {(hasStrongsData || highlights.length > 0) && (
                <button type="button" className="text-link" style={{ marginTop: 8, fontSize: 13 }} onClick={onOpenStrongs}>
                  查看逐词
                </button>
              )}
            </section>

            <section className="verse-compare-block">
              <p className="verse-compare-section-title">小爱解读</p>
              {aiBusy && !aiBody ? <p className="muted" style={{ fontSize: 13 }}>小爱正在整理…</p> : null}
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
              {!aiBusy && !aiErr && !aiBody && aiDone ? (
                <p className="muted" style={{ fontSize: 13 }}>暂无解读，请稍后重试。</p>
              ) : null}
            </section>
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
          <p className="muted verse-compare-disclaimer">AI 释义，请以圣经与原文为准</p>
        </div>
      </div>
    </AppBodyPortal>
  );
}
