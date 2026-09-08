'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatStream, type Citation } from '@/lib/api';
import AnswerText from '@/components/AnswerText';
import { CitationBar } from '@/components/CitationBar';
import { CitationEvidenceRail } from '@/components/assistant/CitationEvidenceRail';
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
import { SCENES, sceneTimeout, type AssistantScene } from '@/lib/assistant_scenes';
import { mergeAssistantStreamError } from '@/lib/assistant_stream_error';
import {
  buildHalfSheetQuestion,
  halfSheetCacheSelection,
  readHalfSheetCache,
  writeHalfSheetCache,
  isHalfSheetAnswerComplete,
} from '@/lib/xiaoai_halfsheet_cache';
import {
  defaultHalfSheetFollowups,
  halfSheetL1Chips,
  halfSheetSelectionKey,
  type HalfSheetChipDef,
} from '@/lib/half_sheet_chips';
import {
  newTurnId,
  readHalfSheetThread,
  writeHalfSheetThread,
  type HalfSheetTurn,
} from '@/lib/xiaoai_halfsheet_thread';
import {
  AssistantThinkingState,
  type ThinkingPhase,
} from '@/components/assistant/AssistantThinkingState';
import { RagSourceStatus } from '@/components/assistant/RagSourceStatus';
import { getSessionKnowledgeBaseId, DEFAULT_KB_ID } from '@/lib/assistant_knowledge_base';
import { AnalysisShareSheet } from '@/components/AnalysisShareSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { HalfSheetChipRows } from '@/components/reader/HalfSheetChipRows';
import { HalfSheetLightActions } from '@/components/reader/HalfSheetLightActions';

function stripAnswer(raw: string): string {
  return bodyText(raw);
}

type TurnView = HalfSheetTurn & {
  busy?: boolean;
  streamIncomplete?: boolean;
  useRag?: boolean;
  kbId?: string;
  kbName?: string;
};

function resolveInitialScene(explicitSelection: boolean, selectionText: string): AssistantScene {
  const sel = explicitSelection ? selectionText.trim() : '';
  return sel ? 'verse_full' : 'verse_quick';
}

function buildUserQuestion(refLabel: string, selectionText: string): string {
  const snippet = selectionText.trim();
  if (snippet) {
    const short = snippet.length > 80 ? `${snippet.slice(0, 80)}…` : snippet;
    return `请解读：${refLabel}\n「${short}」`;
  }
  return `请解读：${refLabel}`;
}

export default function XiaoAiSheet({
  refParam,
  refLabel,
  selectionText,
  explicitSelection = true,
  onClose,
}: {
  refParam: string;
  refLabel: string;
  selectionText: string;
  explicitSelection?: boolean;
  onClose: () => void;
}) {
  const initialScene = resolveInitialScene(explicitSelection, selectionText);
  const selectionKey = halfSheetSelectionKey(refParam, selectionText, explicitSelection);
  const userQuestion = useMemo(
    () => buildUserQuestion(refLabel, explicitSelection ? selectionText : ''),
    [refLabel, selectionText, explicitSelection],
  );
  const l1Chips = useMemo(() => halfSheetL1Chips(refLabel), [refLabel]);

  const [turns, setTurns] = useState<TurnView[]>(() => {
    const saved = readHalfSheetThread(refParam, selectionKey);
    if (saved?.turns.length) {
      return saved.turns.map((t) => ({ ...t, busy: false }));
    }
    return [];
  });
  const [activeTurnId, setActiveTurnId] = useState<string | null>(() => {
    const saved = readHalfSheetThread(refParam, selectionKey);
    return saved?.turns.at(-1)?.id ?? null;
  });
  const [retryKey, setRetryKey] = useState(0);
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});
  const [citationOpen, setCitationOpen] = useState<number | null>(null);
  const [citationTurnId, setCitationTurnId] = useState<string | null>(null);
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const [savedTurnId, setSavedTurnId] = useState<string | null>(null);
  const [shareTurn, setShareTurn] = useState<TurnView | null>(null);
  const flash = useToast();

  const scrollRef = useRef<HTMLDivElement>(null);
  const accRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const lockedRef = useRef({
    refParam,
    refLabel,
    selectionText,
    explicitSelection,
    selectionKey,
    userQuestion,
  });
  const emptyAnswerMsg = '⚠️ 未收到回答，请重试';

  useEffect(() => {
    lockedRef.current = {
      refParam,
      refLabel,
      selectionText,
      explicitSelection,
      selectionKey,
      userQuestion,
    };
  }, [refParam, refLabel, selectionText, explicitSelection, selectionKey, userQuestion]);

  useEffect(() => {
    recordHalfSheetXiaoAi();
    recordXiaoAiQuestion({ scene: initialScene, ref: refParam });
  }, [initialScene, refParam]);

  const persistThread = useCallback(
    (nextTurns: TurnView[]) => {
      const doneTurns = nextTurns.filter((t) => !t.busy && t.answer.trim());
      writeHalfSheetThread({
        ref: refParam,
        selectionKey,
        turns: doneTurns.map(({ busy: _b, streamIncomplete: _s, useRag: _u, kbId: _k, kbName: _n, ...t }) => t),
      });
    },
    [refParam, selectionKey],
  );

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const runChat = useCallback(
    (
      turnId: string,
      question: string,
      scene: AssistantScene,
      opts?: { isRetry?: boolean; history?: Array<{ role: 'user' | 'assistant'; content: string }> },
    ) => {
      const runId = ++runIdRef.current;
      accRef.current = '';
      const {
        refParam: ref,
        refLabel: label,
        selectionText: sel,
        explicitSelection: explicitSel,
      } = lockedRef.current;

      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                busy: true,
                answer: '',
                streamIncomplete: false,
                userQuestion: question,
                scene,
              }
            : t,
        ),
      );

      const cacheSel = halfSheetCacheSelection(sel, explicitSel);
      const apiQuestion =
        scene === 'verse_full' || scene === 'verse_quick'
          ? buildHalfSheetQuestion(question, sel, explicitSel)
          : question;

      if (!opts?.isRetry) {
        const cached = readHalfSheetCache(scene, ref, cacheSel, apiQuestion);
        if (cached) {
          const followups = defaultHalfSheetFollowups(label);
          setTurns((prev) => {
            const next = prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    answer: cached.answer,
                    citations: cached.citations,
                    followups,
                    busy: false,
                    streamIncomplete: false,
                  }
                : t,
            );
            persistThread(next);
            return next;
          });
          setActiveTurnId(turnId);
          scrollToBottom();
          return () => {};
        }
      }

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), sceneTimeout(scene));
      const slowTimer = window.setTimeout(() => {}, 15000);
      let cancelled = false;
      let cites: Citation[] = [];
      let gotDelta = false;
      let streamPhase: ThinkingPhase = 'understanding';
      let useRag: boolean | undefined;
      let kbId = DEFAULT_KB_ID;
      let kbName: string | undefined;
      let serverFollowups: string[] = [];

      const sessionKb = getSessionKnowledgeBaseId();

      void chatStream(
        {
          ref,
          question: apiQuestion,
          mode: SCENES[scene].mode,
          scene,
          reader_context: buildAssistantReaderContext(),
          knowledge_base_id: sessionKb !== DEFAULT_KB_ID ? sessionKb : undefined,
          surface: 'half_sheet',
          history: opts?.history,
        },
        {
          onMeta: (meta) => {
            if (cancelled || runId !== runIdRef.current) return;
            const book = label.replace(/\s*\d+.*$/, '').trim();
            cites = localizeCitations(meta.citations || [], book || undefined);
            if (typeof meta.use_rag === 'boolean') useRag = meta.use_rag;
            if (meta.knowledge_base_id) kbId = meta.knowledge_base_id;
            if (meta.knowledge_base_name) kbName = meta.knowledge_base_name;
            streamPhase = 'refs';
            setTurns((prev) =>
              prev.map((t) =>
                t.id === turnId ? { ...t, citations: cites, useRag, kbId, kbName } : t,
              ),
            );
          },
          onDelta: (t) => {
            if (cancelled || runId !== runIdRef.current) return;
            if (!gotDelta) gotDelta = true;
            streamPhase = 'writing';
            accRef.current += t;
            if (rafRef.current == null) {
              rafRef.current = window.setTimeout(() => {
                rafRef.current = null;
                const pending = accRef.current;
                setTurns((prev) =>
                  prev.map((turn) =>
                    turn.id === turnId ? { ...turn, answer: pending } : turn,
                  ),
                );
              }, 72) as unknown as number;
            }
          },
          onFollowups: (items) => {
            if (items.length) serverFollowups = items;
          },
          onError: (msg) => {
            if (cancelled || runId !== runIdRef.current) return;
            if (rafRef.current != null) {
              window.clearTimeout(rafRef.current);
              rafRef.current = null;
            }
            const partial = accRef.current.trim();
            if (partial) {
              setTurns((prev) => {
                const next = prev.map((t) =>
                  t.id === turnId
                    ? { ...t, answer: partial, busy: false, streamIncomplete: true }
                    : t,
                );
                persistThread(next);
                return next;
              });
              return;
            }
            const err = mergeAssistantStreamError('', msg);
            setTurns((prev) =>
              prev.map((t) =>
                t.id === turnId ? { ...t, answer: err, busy: false } : t,
              ),
            );
          },
          onDone: (payload) => {
            if (cancelled || runId !== runIdRef.current) return;
            if (rafRef.current != null) {
              window.clearTimeout(rafRef.current);
              rafRef.current = null;
            }
            let text = accRef.current.trim();
            if (!text) text = emptyAnswerMsg;
            const streamOk =
              payload?.streamComplete !== false &&
              Boolean(text) &&
              !text.startsWith('⚠️');
            const structOk =
              scene === 'verse_full' || scene === 'verse_quick'
                ? isHalfSheetAnswerComplete(text, scene)
                : true;
            const followups =
              payload?.followups?.length
                ? payload.followups
                : serverFollowups.length
                  ? serverFollowups
                  : defaultHalfSheetFollowups(label);
            setTurns((prev) => {
              const next = prev.map((t) =>
                t.id === turnId
                  ? {
                      ...t,
                      answer: text,
                      citations: cites.length ? cites : t.citations,
                      followups,
                      busy: false,
                      streamIncomplete: !streamOk || !structOk,
                      useRag,
                      kbId,
                      kbName,
                    }
                  : t,
              );
              if (streamOk && structOk && !text.startsWith('⚠️')) {
                writeHalfSheetCache(scene, ref, cacheSel, apiQuestion, text, cites);
              }
              persistThread(next);
              return next;
            });
            setActiveTurnId(turnId);
            scrollToBottom();
          },
        },
        { signal: controller.signal },
      ).finally(() => {
        window.clearTimeout(timer);
        window.clearTimeout(slowTimer);
        if (!cancelled && runId === runIdRef.current) {
          setTurns((prev) =>
            prev.map((t) => {
              if (t.id !== turnId || !t.busy) return t;
              const text = accRef.current.trim() || emptyAnswerMsg;
              return { ...t, answer: text, busy: false };
            }),
          );
        }
      });

      return () => {
        cancelled = true;
        controller.abort();
        window.clearTimeout(timer);
        window.clearTimeout(slowTimer);
        if (rafRef.current != null) window.clearTimeout(rafRef.current);
      };
    },
    [persistThread, scrollToBottom],
  );

  useEffect(() => {
    if (turns.length > 0) return;
    const turnId = newTurnId();
    setTurns([
      {
        id: turnId,
        userQuestion,
        answer: '',
        citations: [],
        scene: initialScene,
        followups: [],
        busy: true,
      },
    ]);
    setActiveTurnId(turnId);
    setExpandedTurns({ [turnId]: true });
    return runChat(turnId, userQuestion, initialScene);
  }, [turns.length, initialScene, userQuestion, runChat]);

  useEffect(() => {
    if (retryKey === 0) return;
    const turnId = newTurnId();
    setTurns([
      {
        id: turnId,
        userQuestion,
        answer: '',
        citations: [],
        scene: initialScene,
        followups: [],
        busy: true,
      },
    ]);
    setActiveTurnId(turnId);
    return runChat(turnId, userQuestion, initialScene, { isRetry: true });
  }, [retryKey, initialScene, userQuestion, runChat]);

  const activeTurn = turns.find((t) => t.id === activeTurnId) ?? turns.at(-1);
  const completedTurns = turns.filter((t) => !t.busy && t.answer.trim());
  const chipTurn = activeTurn && !activeTurn.busy ? activeTurn : completedTurns.at(-1);
  const followupCount = turns.filter(
    (t) => t.scene.startsWith('chat_') || turns.indexOf(t) > 0,
  ).length;
  const deepChatEmphasis = followupCount >= 2;

  const appendTurn = useCallback(
    (question: string, scene: AssistantScene) => {
      if (turns.length >= 3) return;
      const turnId = newTurnId();
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = turns
        .filter((t) => t.answer.trim() && !t.answer.startsWith('⚠️'))
        .flatMap((t) => [
          { role: 'user' as const, content: t.userQuestion },
          { role: 'assistant' as const, content: stripAnswer(t.answer) },
        ]);
      setTurns((prev) => [
        ...prev,
        {
          id: turnId,
          userQuestion: question,
          answer: '',
          citations: [],
          scene,
          followups: [],
          busy: true,
        },
      ]);
      setActiveTurnId(turnId);
      setExpandedTurns((m) => ({ ...m, [turnId]: true }));
      scrollToBottom();
      runChat(turnId, question, scene, { history });
    },
    [runChat, scrollToBottom, turns],
  );

  const continueWithAssistant = () => {
    const seedTurns = turns.filter((t) => t.answer.trim() && !t.answer.startsWith('⚠️'));
    if (seedTurns.length) {
      navigateToAssistant(refParam, {
        seedMessages: seedTurns.flatMap((t) => {
          const clean = stripAnswer(t.answer);
          const used = citationsUsedInText(clean, t.citations);
          return [
            { role: 'user' as const, text: t.userQuestion },
            {
              role: 'assistant' as const,
              text: clean,
              citations: used.length ? used : undefined,
              scene: t.scene,
            },
          ];
        }),
        scene: seedTurns.at(-1)?.scene ?? initialScene,
      });
    } else {
      navigateToAssistant(refParam);
    }
    onClose();
  };

  const stopBubble = (e: React.SyntheticEvent) => e.stopPropagation();

  const sheet = (
    <div className="reader-ai-portal" data-dismiss-on-tab-nav>
      <div
        className="half-sheet reader-ai-half-sheet"
        role="dialog"
        aria-modal="false"
        aria-label="小爱解经"
        onClick={stopBubble}
        onMouseDown={stopBubble}
        onPointerDown={stopBubble}
      >
        <div className="half-sheet-head reader-ai-half-head">
          <div className="half-sheet-grab" aria-hidden />
          <div className="half-sheet-title">
            <strong className="reader-ai-head-title">小爱解经</strong>
            <span className="reader-ai-ref-pill">{refLabel}</span>
            <SheetCloseButton onClick={onClose} />
          </div>
        </div>

        <div className="half-sheet-body reader-ai-half-body" ref={scrollRef}>
          {turns.length > 1 ? (
            <div className="half-sheet-thread-fold">
              {turns.slice(0, -1).map((t) => (
                <details key={t.id} className="half-sheet-thread-prior">
                  <summary>{t.userQuestion.slice(0, 28)}…</summary>
                  <AnswerText text={stripAnswer(t.answer)} dense onCitationClick={() => {}} />
                </details>
              ))}
            </div>
          ) : null}

          {turns.map((turn, index) => {
            const isLast = index === turns.length - 1;
            if (!isLast) return null;
            const clean = stripAnswer(turn.answer);
            const hasError = clean.startsWith('⚠️');
            const usedCitations = citationsUsedInText(clean, turn.citations);
            const evidenceCites = usedCitations.length > 0 ? usedCitations : turn.citations;
            const { summary, body: bodyWithoutSummary } = extractSummaryLead(clean);
            const expanded = expandedTurns[turn.id] !== false;
            const showCollapsed =
              !expanded && !hasError && summary && bodyWithoutSummary;

            return (
              <div key={turn.id} className="half-sheet-turn">
                <div className="half-sheet-user-bubble assistant-user-text">
                  {selectionText.trim() && index === 0
                    ? selectionText.length > 120
                      ? `${selectionText.slice(0, 120)}…`
                      : selectionText
                    : turn.userQuestion}
                </div>

                <div className="half-sheet-answer half-sheet-answer-rich">
                  <div className="half-sheet-answer-body reader-ai-answer assistant-answer">
                    {turn.busy && !clean ? (
                      <AssistantThinkingState
                        variant="halfsheet"
                        phase={
                          turn.citations.length
                            ? 'refs'
                            : clean
                              ? 'writing'
                              : 'understanding'
                        }
                        citeCount={turn.citations.length}
                      />
                    ) : clean ? (
                      <>
                        {!hasError && !turn.busy ? (
                          <RagSourceStatus
                            count={evidenceCites.length}
                            useRag={turn.useRag}
                            knowledgeBaseId={turn.kbId}
                            knowledgeBaseName={turn.kbName}
                            onReview={
                              evidenceCites.length > 0
                                ? () => {
                                    setCitationTurnId(turn.id);
                                    setCitationOpen(evidenceCites[0]?.n ?? null);
                                  }
                                : undefined
                            }
                          />
                        ) : null}
                        {showCollapsed ? (
                          <>
                            <p className="xiaoai-summary-lead">{summary}</p>
                            <button
                              type="button"
                              className="text-link xiaoai-expand-btn"
                              onClick={() =>
                                setExpandedTurns((m) => ({ ...m, [turn.id]: true }))
                              }
                            >
                              展开完整解读
                            </button>
                          </>
                        ) : (
                          <AnswerText
                            text={clean}
                            streaming={turn.busy}
                            dense={turn.scene === 'verse_quick'}
                            onCitationClick={(n) => {
                              recordCitationClick();
                              setCitationTurnId(turn.id);
                              setCitationOpen(n);
                            }}
                          />
                        )}
                        {!turn.busy && !hasError && evidenceCites.length > 0 ? (
                          <CitationEvidenceRail
                            citations={evidenceCites}
                            bookName={refLabel.split(' ')[0]}
                            onOpen={(n) => {
                              recordCitationClick();
                              setCitationTurnId(turn.id);
                              setCitationOpen(n);
                            }}
                          />
                        ) : null}
                        {!turn.busy && !hasError ? (
                          <HalfSheetLightActions
                            copied={copiedTurnId === turn.id}
                            saved={savedTurnId === turn.id}
                            showSources={evidenceCites.length > 0}
                            onCopy={() => {
                              void navigator.clipboard.writeText(clean);
                              setCopiedTurnId(turn.id);
                              window.setTimeout(() => setCopiedTurnId(null), 1800);
                            }}
                            onSaveThought={() => {
                              addThought(refParam || 'FREE', clean, 'private', {
                                skipPublish: true,
                              });
                              recordSaveAnswerNote();
                              setSavedTurnId(turn.id);
                              flash('已存为想法（本机）');
                              window.setTimeout(() => setSavedTurnId(null), 1800);
                            }}
                            onOpenSources={() => {
                              setCitationTurnId(turn.id);
                              setCitationOpen(evidenceCites[0]?.n ?? null);
                            }}
                            onShare={() => setShareTurn(turn)}
                          />
                        ) : null}
                        {turn.streamIncomplete && !turn.busy ? (
                          <p className="muted xiaoai-disclaimer">
                            解读可能未写完，可点「与小爱深聊」补全。
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>

                {hasError && !turn.busy ? (
                  <button
                    type="button"
                    className="half-sheet-action-btn"
                    onClick={() => setRetryKey((k) => k + 1)}
                  >
                    重试
                  </button>
                ) : null}
              </div>
            );
          })}

          {chipTurn && !chipTurn.busy && !chipTurn.answer.startsWith('⚠️') ? (
            <HalfSheetChipRows
              followups={chipTurn.followups}
              followupsLoading={false}
              l1Chips={l1Chips}
              disabled={turns.some((t) => t.busy) || turns.length >= 3}
              onFollowup={(q) => appendTurn(q, chipTurn.scene.startsWith('chat_') ? chipTurn.scene : 'chat_explain')}
              onL1={(chip: HalfSheetChipDef) => appendTurn(chip.q, chip.scene)}
            />
          ) : chipTurn?.busy ? (
            <HalfSheetChipRows
              followups={[]}
              followupsLoading
              l1Chips={l1Chips}
              disabled
              onFollowup={() => {}}
              onL1={() => {}}
            />
          ) : null}
        </div>

        {chipTurn && !chipTurn.busy && !chipTurn.answer.startsWith('⚠️') ? (
          <div className="half-sheet-foot reader-ai-half-foot">
            <button
              type="button"
              className={
                deepChatEmphasis
                  ? 'half-sheet-deep-chat half-sheet-deep-chat-emphasis'
                  : 'half-sheet-deep-chat'
              }
              onClick={continueWithAssistant}
            >
              与小爱深聊 ›
            </button>
          </div>
        ) : null}

        {citationOpen != null && citationTurnId ? (
          <div className="xiaoai-cite-host" aria-hidden={citationOpen == null}>
            <CitationBar
              variant="action"
              compact
              className="xiaoai-cite-host-trigger"
              citations={
                (turns.find((t) => t.id === citationTurnId)?.citations ?? []).length
                  ? citationsUsedInText(
                      stripAnswer(turns.find((t) => t.id === citationTurnId)?.answer ?? ''),
                      turns.find((t) => t.id === citationTurnId)?.citations ?? [],
                    )
                  : turns.find((t) => t.id === citationTurnId)?.citations ?? []
              }
              activeN={citationOpen}
              onActiveChange={setCitationOpen}
              bookName={refLabel.split(' ')[0]}
            />
          </div>
        ) : null}
      </div>

      {shareTurn ? (
        <AnalysisShareSheet
          refLabel={refLabel}
          refParam={refParam}
          answerText={stripAnswer(shareTurn.answer)}
          citations={shareTurn.citations.length ? shareTurn.citations : undefined}
          onClose={() => setShareTurn(null)}
          onToast={flash}
        />
      ) : null}
    </div>
  );

  return <AppBodyPortal onTabAway={onClose}>{sheet}</AppBodyPortal>;
}
