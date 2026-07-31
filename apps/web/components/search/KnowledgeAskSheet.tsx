'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { chatStream, type Citation } from '@/lib/api';
import AnswerText from '@/components/AnswerText';
import { CitationBar } from '@/components/CitationBar';
import { bodyText } from '@/lib/assistant_format';
import { localizeCitations, citationsUsedInText } from '@/lib/citation_display';
import { buildAssistantReaderContext } from '@/lib/assistant_reader_context';
import {
  AssistantThinkingState,
  type ThinkingPhase,
} from '@/components/assistant/AssistantThinkingState';
import { RagSourceStatus } from '@/components/assistant/RagSourceStatus';
import { getSessionKnowledgeBaseId, DEFAULT_KB_ID } from '@/lib/assistant_knowledge_base';
import { recordHalfSheetXiaoAi, recordXiaoAiQuestion } from '@/lib/badge_events';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import { refSpaceToOsis } from '@/lib/inline_ref';

/** 知识导览半屏问小爱：不离开当前故事页 */
export function KnowledgeAskSheet({
  title,
  question,
  refParam,
  onClose,
}: {
  title: string;
  question: string;
  /** 可选经节，便于 RAG 锚定 */
  refParam?: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [answer, setAnswer] = useState('');
  const [done, setDone] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [useRag, setUseRag] = useState<boolean | undefined>(undefined);
  const [streamPhase, setStreamPhase] = useState<ThinkingPhase>('understanding');
  const [streamCiteCount, setStreamCiteCount] = useState(0);
  const [slowHint, setSlowHint] = useState(false);
  const [kbId, setKbId] = useState(DEFAULT_KB_ID);
  const [kbName, setKbName] = useState<string | undefined>();
  const [retryKey, setRetryKey] = useState(0);
  const [citationOpen, setCitationOpen] = useState<number | null>(null);
  const accRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const fetchStartedRef = useRef(false);
  const lockedRef = useRef({ question, refParam, title });

  useEffect(() => {
    lockedRef.current = { question, refParam, title };
  }, [question, refParam, title]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    recordHalfSheetXiaoAi();
    recordXiaoAiQuestion({ scene: 'chat_general', ref: refParam || '' });
  }, [refParam]);

  const runChat = useCallback(() => {
    accRef.current = '';
    setAnswer('');
    setDone(false);
    setCitations([]);
    setUseRag(undefined);
    setStreamPhase('understanding');
    setStreamCiteCount(0);
    setSlowHint(false);
    setKbName(undefined);
    const sessionKb = getSessionKnowledgeBaseId();
    setKbId(sessionKb);
    const { question: q, refParam: ref } = lockedRef.current;
    const osis = ref ? refSpaceToOsis(ref.replace(/\./g, ' ')) : undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 60_000);
    const slowTimer = window.setTimeout(() => setSlowHint(true), 12_000);
    let cancelled = false;
    let cites: Citation[] = [];
    let gotDelta = false;
    void chatStream(
      {
        ref: osis || undefined,
        question: q,
        mode: 'explain',
        scene: 'chat_general',
        surface: 'knowledge_story',
        reader_context: buildAssistantReaderContext(),
        knowledge_base_id: sessionKb !== DEFAULT_KB_ID ? sessionKb : undefined,
      },
      {
        onMeta: (meta) => {
          cites = localizeCitations(meta.citations || []);
          setCitations(cites);
          if (typeof meta.use_rag === 'boolean') setUseRag(meta.use_rag);
          if (meta.knowledge_base_id) setKbId(meta.knowledge_base_id);
          if (meta.knowledge_base_name) setKbName(meta.knowledge_base_name);
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
          if (!cancelled) setDone(true);
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
  }, [retryKey]);

  useEffect(() => {
    if (fetchStartedRef.current && retryKey === 0) return;
    fetchStartedRef.current = true;
    return runChat();
  }, [runChat, retryKey]);

  const clean = bodyText(answer);
  const usedCitations = useMemo(
    () => citationsUsedInText(clean, citations),
    [clean, citations],
  );
  const hasError = clean.startsWith('⚠️');

  if (!mounted) return null;

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet card half-sheet knowledge-ask-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="half-sheet-title">
          <strong>问小爱 · {title}</strong>
          <SheetCloseButton onClick={onClose} />
        </div>
        <div className="half-sheet-body">
          <div className="half-sheet-user-bubble assistant-user-text">{question}</div>
          <div className="half-sheet-answer half-sheet-answer-rich">
            <span className="half-sheet-badge">圣经知识讲解</span>
            <div className="half-sheet-answer-body reader-ai-answer assistant-answer">
              {!done && !clean ? (
                <AssistantThinkingState
                  phase={streamPhase}
                  citeCount={streamCiteCount}
                  slow={slowHint}
                />
              ) : null}
              {clean ? (
                <>
                  {!hasError ? (
                    <RagSourceStatus
                      count={usedCitations.length || citations.length}
                      useRag={useRag}
                      knowledgeBaseId={kbId}
                      knowledgeBaseName={kbName}
                    />
                  ) : null}
                  <AnswerText text={clean} />
                  {usedCitations.length > 0 ? (
                    <CitationBar
                      citations={usedCitations}
                      activeN={citationOpen}
                      onActiveChange={setCitationOpen}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <div className="half-sheet-actions">
            {hasError || done ? (
              <button
                type="button"
                className="font-pill"
                onClick={() => {
                  fetchStartedRef.current = false;
                  setRetryKey((k) => k + 1);
                }}
              >
                重试
              </button>
            ) : null}
            {done && !hasError ? (
              <button
                type="button"
                className="font-pill accent"
                onClick={() => {
                  navigateToAssistant(refParam ? refSpaceToOsis(refParam.replace(/\./g, ' ')) : undefined, {
                    question,
                    seedMessages: [
                      { role: 'user', text: question },
                      { role: 'assistant', text: clean, citations: usedCitations },
                    ],
                    scene: 'chat_general',
                    surface: 'knowledge_story',
                  });
                }}
              >
                在小爱继续聊
              </button>
            ) : null}
            <button type="button" className="text-link" onClick={onClose}>
              回到导览
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
