'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { chatStream } from '@/lib/api';
import AnswerText from '@/components/AnswerText';
import { CitationBar } from '@/components/CitationBar';
import { createNote } from '@/lib/notes';
import { bodyText } from '@/lib/assistant_format';
import { localizeCitations } from '@/lib/citation_display';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import { sceneTimeout, type AssistantScene } from '@/lib/assistant_scenes';

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
  const accRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const fetchStartedRef = useRef(false);
  const lockedRef = useRef({ scene, refParam, selectionText, userQuestion });

  useEffect(() => {
    lockedRef.current = { scene, refParam, selectionText, userQuestion };
  }, [scene, refParam, selectionText, userQuestion]);

  useEffect(() => setMounted(true), []);

  const runChat = useCallback(() => {
    accRef.current = '';
    setAnswer('');
    setDone(false);
    setCopied(false);
    setCitations([]);
    const { scene: s, refParam: ref, selectionText: sel, userQuestion: q } = lockedRef.current;
    // 经文正文已由 ref 在后端展开，避免重复粘贴长经文挤占输出 token
    const question = sel && sel.length <= 300 ? `${q}\n\n选中文本：${sel}` : q;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), sceneTimeout(s));
    let cancelled = false;
    void chatStream(
      { ref, question, mode: 'explain', scene: s },
      {
        onMeta: (meta) => {
          const book = refLabel.replace(/\s*\d+.*$/, '').trim();
          setCitations(localizeCitations(meta.citations || [], book || undefined));
        },
        onDelta: (t) => {
          if (cancelled) return;
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
          if (!cancelled) setDone(true);
        },
      },
      { signal: controller.signal },
    ).finally(() => {
      window.clearTimeout(timer);
      if (!cancelled) setDone(true);
    });
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (fetchStartedRef.current && retryKey === 0) return;
    fetchStartedRef.current = true;
    return runChat();
  }, [runChat, retryKey]);

  const clean = stripAnswer(answer);
  const hasError = clean.startsWith('⚠️');
  const summaryMatch = clean.match(/【摘要】\s*([^\n【]+)/);
  const summary = summaryMatch?.[1]?.trim() ?? '';
  const bodyWithoutSummary = summary
    ? clean.replace(/【摘要】\s*[^\n【]+/, '').trim()
    : clean;
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
            citations: citations.length ? citations : undefined,
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
    createNote(clean, refParam, ['小爱', '半屏']);
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
            <button type="button" className="text-link" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="half-sheet-body" onMouseDown={stopBubble} onMouseUp={stopBubble}>
          {selectionText && (
            <div className="half-sheet-verse">
              {selectionText.length > 120 ? `${selectionText.slice(0, 120)}…` : selectionText}
            </div>
          )}
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
                      onCitationClick={(n) => setCitationOpen(n)}
                    />
                  )}
                </>
              ) : (
                <p className="muted">小爱正在解读…</p>
              )}
            </div>
            {citations.length > 0 && done && (
              <CitationBar
                citations={citations}
                activeN={citationOpen}
                onActiveChange={setCitationOpen}
                bookName={refLabel.split(' ')[0]}
              />
            )}
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
        <div className="half-sheet-foot half-sheet-actions">
          {done && clean && !hasError && (
            <>
              <button type="button" className="half-sheet-action-btn" onClick={() => void copyAnswer()}>
                {copied ? '已复制' : '复制'}
              </button>
              <button type="button" className="half-sheet-action-btn" onClick={saveNote}>
                {saved ? '已存笔记' : '存笔记'}
              </button>
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
