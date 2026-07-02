'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { chatStream } from '@/lib/api';
import AnswerText from '@/components/AnswerText';
import { createNote } from '@/lib/notes';
import { assistantHref as buildAssistantHref } from '@/lib/assistant_prefill';

const ASK_PROMPT =
  '请用通顺、自然的简体中文解读这段经文。严格按【背景】【经文解释】两段输出，' +
  '每段 2–4 句，句子完整、避免堆砌术语；【背景】交代历史与上下文；【经文解释】说清经文原意与关键词；' +
  '总篇幅 180–280 字，不要输出【应用】或【相关追问】。';

const EXPLAIN_PROMPT =
  '用 3–5 句通顺自然的简体中文解释这段经文的原意与关键词，避免术语堆砌，不要输出【应用】或【相关追问】。';

const CHAT_TIMEOUT_MS = 45000;

function stripAnswer(raw: string): string {
  return raw
    .replace(/\n?\s*【相关追问】[\s\S]*/, '')
    .replace(/\n?\s*【应用】[\s\S]*?(?=\n【|$)/, '')
    .trim();
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
  const [answer, setAnswer] = useState('');
  const [done, setDone] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const accRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const fetchStartedRef = useRef(false);
  const lockedRef = useRef({ mode, refParam, selectionText });

  useEffect(() => {
    lockedRef.current = { mode, refParam, selectionText };
  }, [mode, refParam, selectionText]);

  useEffect(() => setMounted(true), []);

  const runChat = useCallback(() => {
    accRef.current = '';
    setAnswer('');
    setDone(false);
    setCopied(false);
    const { mode: m, refParam: ref, selectionText: sel } = lockedRef.current;
    const base = m === 'ask' ? ASK_PROMPT : EXPLAIN_PROMPT;
    const question = sel ? `${base}\n\n经文：${sel}` : base;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
    let cancelled = false;
    void chatStream(
      { ref, question, mode: 'explain' },
      {
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

  const [assistantHref, setAssistantHref] = useState(
    () => `/assistant?ref=${encodeURIComponent(refParam)}`,
  );

  const userChatPreview = useMemo(() => {
    const sel = lockedRef.current.selectionText;
    if (sel) {
      const snippet = sel.length > 80 ? `${sel.slice(0, 80)}…` : sel;
      return `请解读：${refLabel}\n「${snippet}」`;
    }
    return `请解读：${refLabel}`;
  }, [refLabel, done, clean]);

  useEffect(() => {
    if (!done || !clean || hasError) {
      setAssistantHref(`/assistant?ref=${encodeURIComponent(refParam)}`);
      return;
    }
    setAssistantHref(
      buildAssistantHref(refParam, {
        seedMessages: [
          { role: 'user', text: userChatPreview },
          { role: 'assistant', text: clean },
        ],
      }),
    );
  }, [refParam, userChatPreview, done, clean, hasError]);

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
              {mode === 'ask' ? '小爱解读 · 背景·经文解释' : '小爱解释'}
            </span>
            <div className="half-sheet-answer-body reader-ai-answer">
              {clean ? (
                <AnswerText text={clean} />
              ) : (
                <p className="muted">小爱正在解读…</p>
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
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              内容由 AI 生成，请以圣经原文为准。请用下方「复制」按钮，避免拖选文字。
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
          <Link
            href={assistantHref}
            className="half-sheet-action-btn half-sheet-action-primary"
            onClick={onClose}
          >
            与小爱继续聊
          </Link>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
