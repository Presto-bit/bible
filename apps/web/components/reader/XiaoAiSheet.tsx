'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { chatStream } from '@/lib/api';
import AnswerText from '@/components/AnswerText';
import { CitationBar } from '@/components/CitationBar';
import { addThought } from '@/lib/reader_thoughts';
import { extractSummaryLead } from '@/lib/assistant_markdown';
import {
  recordCitationClick,
  recordHalfSheetXiaoAi,
  recordSaveAnswerNote,
  recordXiaoAiQuestion,
} from '@/lib/badge_events';
import { bodyText } from '@/lib/assistant_format';
import { localizeCitations, citationsUsedInText } from '@/lib/citation_display';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import { buildAssistantReaderContext } from '@/lib/assistant_reader_context';
import { sceneTimeout, type AssistantScene } from '@/lib/assistant_scenes';
import { readHalfSheetCache, writeHalfSheetCache } from '@/lib/xiaoai_halfsheet_cache';
import {
  AssistantThinkingState,
  type ThinkingPhase,
} from '@/components/assistant/AssistantThinkingState';

function stripAnswer(raw: string): string {
  return bodyText(raw);
}

export default function XiaoAiSheet({
  mode,
  refParam,
  refLabel,
  selectionText,
  onClose,
}: {
  mode: 'ask' | 'explain';
  refParam: string;
  refLabel: string;
  selectionText: string;
  onClose: () => void;
}) {
  const scene: AssistantScene = mode === 'ask' ? 'verse_full' : 'verse_quick';
  const userQuestion = useMemo(() => {
    const snippet = selectionText.trim();
    if (snippet) {
      const short = snippet.length > 80 ? `${snippet.slice(0, 80)}…` : snippet;
      return `请解读：${refLabel}\n「${short}」`;
    }
    return `请解读：${refLabel}`;
  }, [refLabel, selectionText]);

  const [answer, setAnswer] = useState('');
  const [done, setDone] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [citationOpen, setCitationOpen] = useState<number | null>(null);
  const [citations, setCitations] = useState<import('@/lib/api').Citation[]>([]);
  const [streamPhase, setStreamPhase] = useState<ThinkingPhase>('understanding');
  const [streamCiteCount, setStreamCiteCount] = useState(0);
  const [slowHint, setSlowHint] = useState(false);
  const accRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const fetchStartedRef = useRef(false);
  const lockedRef = useRef({ scene, refParam, selectionText, userQuestion });

  useEffect(() => {
    lockedRef.current = { scene, refParam, selectionText, userQuestion };
  }, [scene, refParam, selectionText, userQuestion]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    recordHalfSheetXiaoAi();
    recordXiaoAiQuestion({ scene, ref: refParam });
  }, [scene, refParam]);

  const runChat = useCallback(() => {
    accRef.current = '';
    setAnswer('');
    setDone(false);
    setCopied(false);
    setCitations([]);
    setStreamPhase('understanding');
    setStreamCiteCount(0);
    setSlowHint(false);
    const { scene: s, refParam: ref, selectionText: sel, userQuestion: q } = lockedRef.current;
    // 经文正文已由 ref 在后端展开，避免重复粘贴长经文挤占输出 token
    const question = sel && sel.length <= 300 ? `${q}\n\n选中文本：${sel}` : q;
    const cached = retryKey > 0 ? null : readHalfSheetCache(s, ref, sel, question);
    if (cached) {
      accRef.current = cached.answer;
      setAnswer(cached.answer);
      setCitations(cached.citations);
      setDone(true);
      return () => {};
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), sceneTimeout(s));
    const slowTimer = window.setTimeout(() => setSlowHint(true), 15000);
    let cancelled = false;
    let cites: import('@/lib/api').Citation[] = [];
    let gotDelta = false;
    void chatStream(
      {
        ref,
        question,
        mode: 'explain',
        scene: s,
        reader_context: buildAssistantReaderContext(),
      },
      {
        onMeta: (meta) => {
          const book = refLabel.replace(/\s*\d+.*$/, '').trim();
          cites = localizeCitations(meta.citations || [], book || undefined);
          setCitations(cites);
          setStreamCiteCount(cites.length);
          setStreamPhase('refs');
        },
        onDelta: (t) => {
          if (cancelled) return;
          if (!gotDelta) {
            gotDelta = true;
            setStreamPhase('writing');
          }
          accRef.current += t;
          if (rafRef.current == null) {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = null;
              setAnswer(accRef.current);
            });
          }
        },
        onError: (msg) => {
          if (cancelled) return;
          accRef.current = `⚠️ ${msg}`;
          setAnswer(accRef.current);
          setDone(true);
        },
        onDone: () => {
          if (!cancelled) {
            setDone(true);
            writeHalfSheetCache(s, ref, sel, question, accRef.current, cites);
          }
        },
      },
      { signal: controller.signal },
    ).finally(() => {
      window.clearTimeout(timer);
      window.clearTimeout(slowTimer);
      if (!cancelled) setDone(true);
    });
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
      window.clearTimeout(slowTimer);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [refLabel, retryKey]);

  useEffect(() => {
    if (fetchStartedRef.current && retryKey === 0) return;
    fetchStartedRef.current = true;
    return runChat();
  }, [runChat, retryKey]);

  const clean = stripAnswer(answer);
  const usedCitations = useMemo(
    () => citationsUsedInText(clean, citations),
    [clean, citations],
  );
  const hasError = clean.startsWith('⚠️');
  const { summary, body: bodyWithoutSummary } = extractSummaryLead(clean);
  const showCollapsed = !expanded && !hasError && summary && bodyWithoutSummary;

  const copyAnswer = async () => {
    if (!clean || hasError) return;
    try {
      await navigator.clipboard.writeText(clean);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const continueWithAssistant = () => {
    if (done && clean && !hasError) {
      navigateToAssistant(refParam, {
        seedMessages: [
          { role: 'user', text: userQuestion },
          {
            role: 'assistant',
            text: clean,
            citations: usedCitations.length ? usedCitations : undefined,
            scene,
            sceneLabel: mode === 'ask' ? '经文解读' : '经文解释',
          },
        ],
        scene,
      });
    } else {
      navigateToAssistant(refParam);
    }
    onClose();
  };

  const saveNote = () => {
    if (!clean || hasError) return;
    if (refParam) addThought(refParam, clean, 'private', { skipPublish: true });
    recordSaveAnswerNote();
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const stopBubble = (e: React.SyntheticEvent) => e.stopPropagation();

  const sheet = (
    <div className="sheet-backdrop reader-ai-backdrop" onClick={onClose}>
      <div
        className="half-sheet"
        onClick={stopBubble}
        onMouseDown={stopBubble}
        onMouseUp={stopBubble}
        onPointerDown={stopBubble}
        onPointerUp={stopBubble}
      >
        <div className="half-sheet-head">
          <div className="half-sheet-grab" />
          <div className="half-sheet-title">
            <strong>{mode === 'ask' ? '问小爱' : '解释'} · {refLabel}</strong>
            <SheetCloseButton onClick={onClose} />
          </div>
        </div>
        <div className="half-sheet-body" onMouseDown={stopBubble} onMouseUp={stopBubble}>
          <div className="half-sheet-user-bubble assistant-user-text">
            {selectionText.trim()
              ? (selectionText.length > 120 ? `${selectionText.slice(0, 120)}…` : selectionText)
              : userQuestion}
          </div>
          <div className="half-sheet-answer half-sheet-answer-rich">
            <span className="half-sheet-badge">
              {mode === 'ask' ? '小爱解读 · 摘要·背景·解释' : '小爱解释'}
            </span>
            <div className="half-sheet-answer-body reader-ai-answer assistant-answer">
              {clean ? (
                <>
                  {showCollapsed ? (
                    <>
                      <p className="xiaoai-summary-lead">{summary}</p>
                      <button
                        type="button"
                        className="text-link xiaoai-expand-btn"
                        onClick={() => setExpanded(true)}
                      >
                        展开完整解读
                      </button>
                    </>
                  ) : (
                    <AnswerText
                      text={clean}
                      streaming={!done}
                      dense={mode === 'explain'}
                      citations={citations}
                      onCitationClick={(n) => {
                        recordCitationClick();
                        setCitationOpen(n);
                      }}
                    />
                  )}
                </>
              ) : (
                <AssistantThinkingState
                  phase={streamPhase}
                  citeCount={streamCiteCount}
                  slow={slowHint && !done}
                />
              )}
            </div>
          </div>
          {hasError && (
            <button
              type="button"
              className="half-sheet-action-btn"
              style={{ marginTop: 10 }}
              onClick={() => {
                fetchStartedRef.current = false;
                setRetryKey((k) => k + 1);
              }}
            >
              重试
            </button>
          )}
          {done && clean && !hasError && (
            <p className="muted xiaoai-disclaimer">
              内容由 AI 生成，请以圣经原文为准。
            </p>
          )}
        </div>
        <div className="half-sheet-foot half-sheet-actions reader-ai-actions">
          {done && clean && !hasError && (
            <>
              <button type="button" className="half-sheet-action-btn" onClick={() => void copyAnswer()}>
                {copied ? '已复制' : '复制'}
              </button>
              <button type="button" className="half-sheet-action-btn" onClick={saveNote}>
                {saved ? '已存笔记' : '存笔记'}
              </button>
              {usedCitations.length > 0 ? (
                <CitationBar
                  variant="action"
                  compact
                  className="half-sheet-action-btn reader-ai-cite-btn"
                  citations={usedCitations}
                  activeN={citationOpen}
                  onActiveChange={setCitationOpen}
                  bookName={refLabel.split(' ')[0]}
                />
              ) : (
                <span className="half-sheet-action-btn reader-ai-action-spacer" aria-hidden />
              )}
            </>
          )}
          <button
            type="button"
            className="half-sheet-action-btn half-sheet-action-primary"
            onClick={continueWithAssistant}
          >
            与小爱继续聊
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
