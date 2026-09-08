'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatStream, type Citation } from '@/lib/api';
import AnswerText from '@/components/AnswerText';
import type { AnswerSection } from '@/lib/assistant_sections';
import type { StructureAsset } from '@/lib/assistant_blocks';
import { CitationBar } from '@/components/CitationBar';
import { addThought } from '@/lib/reader_thoughts';
import {
  recordCitationClick,
  recordHalfSheetXiaoAi,
  recordSaveAnswerNote,
  recordXiaoAiQuestion,
} from '@/lib/badge_events';
import { bodyText, normalizeFollowupItems } from '@/lib/assistant_format';
import { localizeCitations, citationsUsedInText, uniqueCitationsForRail } from '@/lib/citation_display';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import { buildAssistantReaderContext } from '@/lib/assistant_reader_context';
import { SCENES, sceneTimeout, type AssistantScene } from '@/lib/assistant_scenes';
import { mergeAssistantStreamError, isAssistantHistoryExcluded } from '@/lib/assistant_stream_error';
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
  responseProfile?: string;
  sections?: AnswerSection[];
  structureAssets?: StructureAsset[];
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

  const bootTurnIdRef = useRef<string | null>(null);
  const chipTapLockRef = useRef(false);
  const [turns, setTurns] = useState<TurnView[]>(() => {
    const saved = readHalfSheetThread(refParam, selectionKey);
    if (saved?.turns.length) {
      return saved.turns.map((t) => ({ ...t, busy: false }));
    }
    const turn: TurnView = {
      id: newTurnId(),
      userQuestion: buildUserQuestion(
        refLabel,
        explicitSelection ? selectionText : '',
      ),
      answer: '',
      citations: [],
      scene: resolveInitialScene(explicitSelection, selectionText),
      followups: [],
      busy: true,
    };
    bootTurnIdRef.current = turn.id;
    return [turn];
  });
  const [activeTurnId, setActiveTurnId] = useState<string | null>(() => {
    const saved = readHalfSheetThread(refParam, selectionKey);
    if (saved?.turns.length) return saved.turns.at(-1)?.id ?? null;
    return bootTurnIdRef.current;
  });
  const [retryKey, setRetryKey] = useState(0);
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
  const streamCleanupRef = useRef<(() => void) | null>(null);
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

  useEffect(() => () => {
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;
  }, []);

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
      streamCleanupRef.current?.();
      streamCleanupRef.current = null;
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

      if (!opts?.isRetry && !opts?.history?.length) {
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
      let responseProfile: string | undefined;
      let answerSections: AnswerSection[] | undefined;
      let structureAssets: StructureAsset[] | undefined;
      let settled = false;

      const flushPendingAnswer = () => {
        if (rafRef.current != null) {
          window.clearTimeout(rafRef.current);
          rafRef.current = null;
        }
        const pending = accRef.current;
        if (!pending) return;
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === turnId && turn.busy ? { ...turn, answer: pending } : turn,
          ),
        );
      };

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
            if (meta.citations_pending) return;
            const book = label.replace(/\s*\d+.*$/, '').trim();
            cites = localizeCitations(meta.citations || [], book || undefined);
            if (typeof meta.use_rag === 'boolean') useRag = meta.use_rag;
            if (meta.knowledge_base_id) kbId = meta.knowledge_base_id;
            if (meta.knowledge_base_name) kbName = meta.knowledge_base_name;
            if (meta.response_profile) responseProfile = meta.response_profile;
            if (meta.structure_assets?.length) {
              structureAssets = meta.structure_assets as StructureAsset[];
            }
            streamPhase = 'refs';
            setTurns((prev) =>
              prev.map((t) =>
                t.id === turnId
                  ? {
                      ...t,
                      citations: cites,
                      useRag,
                      kbId,
                      kbName,
                      responseProfile,
                      structureAssets,
                    }
                  : t,
              ),
            );
          },
          onDelta: (t) => {
            if (cancelled || runId !== runIdRef.current) return;
            streamPhase = 'writing';
            accRef.current += t;
            const pending = accRef.current;
            if (!gotDelta) {
              gotDelta = true;
              setTurns((prev) =>
                prev.map((turn) =>
                  turn.id === turnId ? { ...turn, answer: pending } : turn,
                ),
              );
              return;
            }
            if (rafRef.current == null) {
              rafRef.current = window.setTimeout(() => {
                rafRef.current = null;
                const batched = accRef.current;
                setTurns((prev) =>
                  prev.map((turn) =>
                    turn.id === turnId && turn.busy
                      ? { ...turn, answer: batched }
                      : turn,
                  ),
                );
              }, 48) as unknown as number;
            }
          },
          onFollowups: (items) => {
            if (items.length) serverFollowups = items;
          },
          onError: (msg) => {
            if (cancelled || runId !== runIdRef.current) return;
            settled = true;
            flushPendingAnswer();
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
            accRef.current = err;
            setTurns((prev) =>
              prev.map((t) =>
                t.id === turnId ? { ...t, answer: err, busy: false } : t,
              ),
            );
          },
          onDone: (payload) => {
            if (cancelled || runId !== runIdRef.current) return;
            if (settled) return;
            flushPendingAnswer();
            if (rafRef.current != null) {
              window.clearTimeout(rafRef.current);
              rafRef.current = null;
            }
            const text = accRef.current.trim();
            settled = true;
            if (!text) {
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === turnId ? { ...t, answer: emptyAnswerMsg, busy: false } : t,
                ),
              );
              return;
            }
            const streamOk =
              payload?.streamComplete !== false &&
              Boolean(text) &&
              !text.startsWith('⚠️');
            const structOk =
              scene === 'verse_full' || scene === 'verse_quick'
                ? isHalfSheetAnswerComplete(text, scene)
                : true;
            const followups = normalizeFollowupItems(
              payload?.followups?.length
                ? payload.followups
                : serverFollowups.length
                  ? serverFollowups
                  : defaultHalfSheetFollowups(label),
            );
            if (payload?.sections?.length) {
              answerSections = payload.sections;
            }
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
                      responseProfile,
                      sections: answerSections,
                      structureAssets,
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
      });

      const cleanup = () => {
        cancelled = true;
        controller.abort();
        window.clearTimeout(timer);
        window.clearTimeout(slowTimer);
        if (rafRef.current != null) window.clearTimeout(rafRef.current);
      };
      streamCleanupRef.current = cleanup;
      return cleanup;
    },
    [persistThread, scrollToBottom],
  );

  useEffect(() => {
    const turnId = bootTurnIdRef.current;
    if (!turnId) return;
    bootTurnIdRef.current = null;
    return runChat(turnId, userQuestion, initialScene);
  }, [initialScene, userQuestion, runChat]);

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
  const anyTurnBusy = turns.some((t) => t.busy);
  const chipTurn = activeTurn && !activeTurn.busy ? activeTurn : completedTurns.at(-1);
  const followupCount = turns.filter(
    (t) => t.scene.startsWith('chat_') || turns.indexOf(t) > 0,
  ).length;
  const deepChatEmphasis = followupCount >= 2;

  const appendTurn = useCallback(
    (question: string, scene: AssistantScene) => {
      if (turns.length >= 3 || turns.some((t) => t.busy) || chipTapLockRef.current) {
        return;
      }
      chipTapLockRef.current = true;
      window.setTimeout(() => {
        chipTapLockRef.current = false;
      }, 480);
      const turnId = newTurnId();
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = turns
        .filter((t) => t.answer.trim() && !isAssistantHistoryExcluded(t.answer))
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
      <div className="reader-ai-shield" aria-hidden onPointerDown={stopBubble} />
      <div
        className="half-sheet reader-ai-half-sheet"
        role="dialog"
        aria-modal="true"
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
          {turns.map((turn, index) => {
            const isLast = index === turns.length - 1;
            const clean = stripAnswer(turn.answer);
            const rawAnswer = turn.answer.trim();
            const waitingFirstToken = turn.busy && !rawAnswer;
            const hasError = clean.startsWith('⚠️');
            const usedCitations = citationsUsedInText(clean, turn.citations);
            const evidenceCites = usedCitations.length > 0 ? usedCitations : turn.citations;
            const railCites = uniqueCitationsForRail(evidenceCites);

            return (
              <div
                key={turn.id}
                className={`half-sheet-turn${isLast ? '' : ' half-sheet-thread-prior-open'}`}
              >
                <div className="half-sheet-user-bubble assistant-user-text">
                  {selectionText.trim() && index === 0
                    ? selectionText.length > 120
                      ? `${selectionText.slice(0, 120)}…`
                      : selectionText
                    : turn.userQuestion}
                </div>

                <div
                  className={`half-sheet-answer half-sheet-answer-plain${waitingFirstToken ? ' half-sheet-answer-loading' : ''}`}
                >
                  <div className="half-sheet-answer-body reader-ai-answer assistant-answer allow-text-select">
                    {waitingFirstToken ? (
                      <AssistantThinkingState
                        variant="halfsheet"
                        phase={
                          turn.citations.length
                            ? 'refs'
                            : 'understanding'
                        }
                        citeCount={turn.citations.length}
                      />
                    ) : rawAnswer || !turn.busy ? (
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
                        <AnswerText
                          text={clean || rawAnswer}
                          streaming={turn.busy}
                          dense={turn.scene === 'verse_quick'}
                          onCitationClick={(n) => {
                            recordCitationClick();
                            setCitationTurnId(turn.id);
                            setCitationOpen(n);
                          }}
                        />
                        {!turn.busy && !hasError && railCites.length > 0 ? (
                          <CitationBar
                            className="half-sheet-citations-toggle"
                            citations={railCites}
                            bookName={refLabel.split(' ')[0]}
                            activeN={citationTurnId === turn.id ? citationOpen : undefined}
                            onActiveChange={(n) => {
                              if (n != null) recordCitationClick();
                              setCitationTurnId(n != null ? turn.id : null);
                              setCitationOpen(n);
                            }}
                          />
                        ) : null}
                        {!turn.busy && !hasError && isLast ? (
                          <HalfSheetLightActions
                            copied={copiedTurnId === turn.id}
                            saved={savedTurnId === turn.id}
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
                              flash('已存为笔记（本机）');
                              window.setTimeout(() => setSavedTurnId(null), 1800);
                            }}
                            onShare={() => setShareTurn(turn)}
                          />
                        ) : null}
                        {turn.streamIncomplete && !turn.busy && isLast ? (
                          <p className="muted xiaoai-disclaimer">
                            解读可能未写完，可点「与小爱深聊」补全。
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>

                {hasError && !turn.busy && isLast ? (
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

          {!anyTurnBusy &&
          chipTurn &&
          !chipTurn.busy &&
          !chipTurn.answer.startsWith('⚠️') ? (
            <HalfSheetChipRows
              followups={chipTurn.followups}
              followupsLoading={false}
              l1Chips={l1Chips}
              disabled={turns.length >= 3}
              onFollowup={(q) => appendTurn(q, chipTurn.scene.startsWith('chat_') ? chipTurn.scene : 'chat_explain')}
              onL1={(chip: HalfSheetChipDef) => appendTurn(chip.q, chip.scene)}
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
