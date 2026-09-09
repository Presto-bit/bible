'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, chatStream, type Citation } from '@/lib/api';
import AnswerView from '@/components/assistant/AnswerView';
import type { AnswerSection } from '@/lib/assistant_sections';
import type { StructureAsset } from '@/lib/assistant_blocks';
import { streamSeedTitles, type OutputPlan } from '@/lib/assistant_output_plan';
import {
  currentWritingSectionTitle,
  hasVisibleAssistantAnswer,
} from '@/lib/assistant_visible';
import { resolveDoneAnswer } from '@/lib/assistant_answer_document';
import { SectionStreamAccumulator, type StreamSection } from '@/lib/assistant_section_stream';
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
import { buildHalfSheetTurnRequest, toChatStreamBody } from '@/lib/assistant_turn_request';
import { mergeAssistantStreamError, isAssistantHistoryExcluded } from '@/lib/assistant_stream_error';
import { AssistantStreamPerf } from '@/lib/assistant_perf';
import { isDefaultHalfSheetExplain, readVerseFaqExplain } from '@/lib/verse_faq';
import {
  buildHalfSheetQuestion,
  halfSheetCacheSelection,
  readHalfSheetCache,
  writeHalfSheetCache,
  isHalfSheetAnswerComplete,
  verseSpanFromRef,
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
import { InstantAnswerStatus } from '@/components/assistant/InstantAnswerStatus';
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
  streamSections?: StreamSection[];
  outputPlan?: OutputPlan;
  structureAssets?: StructureAsset[];
  instant?: boolean;
  cacheSource?: string;
  localInstant?: boolean;
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
  const verseSpan = useMemo(() => verseSpanFromRef(refParam), [refParam]);
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
  const [streamSlowHint, setStreamSlowHint] = useState(false);
  const [streamPhase, setStreamPhase] = useState<ThinkingPhase>('understanding');
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
  const conversationIdRef = useRef<string | null>(null);
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
    void api.warmAi();
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
      setStreamSlowHint(false);
      setStreamPhase('understanding');

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
                    localInstant: true,
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

      let cancelled = false;
      const cleanupRef: { fn: (() => void) | null } = { fn: null };
      void (async () => {
        if (
          !opts?.isRetry &&
          !opts?.history?.length &&
          isDefaultHalfSheetExplain(apiQuestion, explicitSel, scene)
        ) {
          const faq = await readVerseFaqExplain(ref);
          if (faq && runId === runIdRef.current && !cancelled) {
            const followups = defaultHalfSheetFollowups(label);
            setTurns((prev) => {
              const next = prev.map((t) =>
                t.id === turnId
                  ? {
                      ...t,
                      answer: faq,
                      citations: [],
                      followups,
                      busy: false,
                      streamIncomplete: false,
                      localInstant: true,
                      cacheSource: 'faq',
                    }
                  : t,
              );
              persistThread(next);
              return next;
            });
            setActiveTurnId(turnId);
            scrollToBottom();
            return;
          }
        }
        if (runId !== runIdRef.current || cancelled) return;

      const controller = new AbortController();
      let genTimer: number | null = null;
      const clearGenTimer = () => {
        if (genTimer != null) {
          window.clearTimeout(genTimer);
          genTimer = null;
        }
      };
      const armGenTimeout = () => {
        clearGenTimer();
        genTimer = window.setTimeout(() => controller.abort(), sceneTimeout(scene));
      };
      const connectTimer = window.setTimeout(() => controller.abort(), 50_000);
      const slowTimer = window.setTimeout(() => setStreamSlowHint(true), 8_000);
      let cites: Citation[] = [];
      let gotDelta = false;
      const streamPerf = new AssistantStreamPerf({ surface: 'half_sheet', scene });
      let useRag: boolean | undefined;
      let kbId = DEFAULT_KB_ID;
      let kbName: string | undefined;
      let serverFollowups: string[] = [];
      let responseProfile: string | undefined;
      let answerSections: AnswerSection[] | undefined;
      let outputPlan: OutputPlan | undefined;
      let structureAssets: StructureAsset[] | undefined;
      let instant = false;
      let cacheSource: string | undefined;
      let streamSections: StreamSection[] = [];
      let settled = false;
      const sectionStream = new SectionStreamAccumulator();
      const syncSectionStream = () => {
        if (!sectionStream.active) return;
        accRef.current = sectionStream.toMarkdown();
        answerSections = sectionStream.getSections();
        streamSections = sectionStream.getRenderableSections();
      };
      const streamTurnPatch = () => ({
        answer: accRef.current,
        sections: answerSections,
        streamSections: streamSections.length ? streamSections : undefined,
      });

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
        toChatStreamBody(
          buildHalfSheetTurnRequest({
            ref,
            question: apiQuestion,
            scene,
            history: opts?.history,
            readerContext: buildAssistantReaderContext(),
            knowledgeBaseId: sessionKb !== DEFAULT_KB_ID ? sessionKb : undefined,
            conversationId: conversationIdRef.current,
          }),
        ),
        {
          onMeta: (meta) => {
            if (cancelled || runId !== runIdRef.current) return;
            if (meta.citations_pending) {
              streamPerf.onPlaceholderMeta();
              return;
            }
            streamPerf.onFullMeta(meta);
            if (meta.conversation_id) {
              conversationIdRef.current = meta.conversation_id;
            }
            window.clearTimeout(connectTimer);
            armGenTimeout();
            const book = label.replace(/\s*\d+.*$/, '').trim();
            cites = localizeCitations(meta.citations || [], book || undefined);
            if (typeof meta.use_rag === 'boolean') useRag = meta.use_rag;
            if (meta.knowledge_base_id) kbId = meta.knowledge_base_id;
            if (meta.knowledge_base_name) kbName = meta.knowledge_base_name;
            if (meta.response_profile) responseProfile = meta.response_profile;
            if (meta.output_plan?.sections?.length) {
              outputPlan = meta.output_plan as OutputPlan;
              sectionStream.seedFromPlan(streamSeedTitles(outputPlan));
              syncSectionStream();
            }
            if (meta.structure_assets?.length) {
              structureAssets = meta.structure_assets as StructureAsset[];
            }
            if (meta.cache_hit || meta.instant) {
              instant = true;
              cacheSource = meta.cache_source;
            }
            setStreamPhase('refs');
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
                      outputPlan,
                      instant,
                      cacheSource,
                      ...streamTurnPatch(),
                    }
                  : t,
              ),
            );
          },
          onSectionStart: (payload) => {
            if (cancelled || runId !== runIdRef.current) return;
            sectionStream.onStart(payload);
            syncSectionStream();
            window.clearTimeout(connectTimer);
            armGenTimeout();
            setStreamPhase('writing');
            if (!gotDelta) {
              gotDelta = true;
              streamPerf.onFirstToken();
              setTurns((prev) =>
                prev.map((turn) =>
                  turn.id === turnId
                    ? {
                        ...turn,
                        ...streamTurnPatch(),
                      }
                    : turn,
                ),
              );
            } else {
              setTurns((prev) =>
                prev.map((turn) =>
                  turn.id === turnId && turn.busy
                    ? { ...turn, ...streamTurnPatch() }
                    : turn,
                ),
              );
            }
          },
          onSectionDelta: (payload) => {
            if (cancelled || runId !== runIdRef.current) return;
            sectionStream.onDelta(payload);
            syncSectionStream();
            window.clearTimeout(connectTimer);
            armGenTimeout();
            setStreamPhase('writing');
            const pending = accRef.current;
            if (!gotDelta) {
              gotDelta = true;
              streamPerf.onFirstToken();
              setTurns((prev) =>
                prev.map((turn) =>
                  turn.id === turnId ? { ...turn, ...streamTurnPatch() } : turn,
                ),
              );
              return;
            }
            streamPerf.onTextUpdate(pending);
            if (rafRef.current == null) {
              rafRef.current = window.setTimeout(() => {
                rafRef.current = null;
                setTurns((prev) =>
                  prev.map((turn) =>
                    turn.id === turnId && turn.busy
                      ? { ...turn, ...streamTurnPatch() }
                      : turn,
                  ),
                );
              }, 48) as unknown as number;
            }
          },
          onSectionDone: (payload) => {
            if (cancelled || runId !== runIdRef.current) return;
            sectionStream.onDone(payload);
            syncSectionStream();
            setTurns((prev) =>
              prev.map((turn) =>
                turn.id === turnId && turn.busy
                  ? { ...turn, ...streamTurnPatch() }
                  : turn,
              ),
            );
          },
          onDelta: (t) => {
            if (cancelled || runId !== runIdRef.current) return;
            if (sectionStream.active) return;
            window.clearTimeout(connectTimer);
            armGenTimeout();
            setStreamPhase('writing');
            accRef.current += t;
            const pending = accRef.current;
            if (!gotDelta) {
              gotDelta = true;
              streamPerf.onFirstToken();
              streamPerf.onTextUpdate(pending);
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
                streamPerf.onTextUpdate(batched);
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
            streamPerf.onError();
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
            streamPerf.onDone();
            if (payload?.conversation_id) {
              conversationIdRef.current = payload.conversation_id;
            }
            flushPendingAnswer();
            if (rafRef.current != null) {
              window.clearTimeout(rafRef.current);
              rafRef.current = null;
            }
            const resolved = resolveDoneAnswer(accRef.current, payload, sectionStream);
            const text = resolved.text.trim();
            if (text && text.length >= accRef.current.trim().length) {
              accRef.current = text;
            }
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
              !text.startsWith('⚠️') &&
              !resolved.incomplete;
            const structOk =
              scene === 'verse_full' || scene === 'verse_quick'
                ? isHalfSheetAnswerComplete(text, scene, verseSpan, outputPlan)
                : true;
            const followups = normalizeFollowupItems(
              resolved.followups?.length
                ? resolved.followups
                : serverFollowups.length
                  ? serverFollowups
                  : defaultHalfSheetFollowups(label),
            );
            if (resolved.sections?.length) {
              answerSections = resolved.sections;
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
                      outputPlan,
                      instant: instant || Boolean(payload?.cache_hit || payload?.instant),
                      cacheSource: cacheSource ?? payload?.cache_source,
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
        { signal: controller.signal, retryOnZeroDelta: false },
      ).finally(() => {
        window.clearTimeout(connectTimer);
        clearGenTimer();
        window.clearTimeout(slowTimer);
        setStreamSlowHint(false);
      });

      const cleanup = () => {
        cancelled = true;
        controller.abort();
        window.clearTimeout(connectTimer);
        clearGenTimer();
        window.clearTimeout(slowTimer);
        setStreamSlowHint(false);
        if (rafRef.current != null) window.clearTimeout(rafRef.current);
      };
      cleanupRef.fn = cleanup;
      streamCleanupRef.current = cleanup;
      })();

      return () => {
        cancelled = true;
        cleanupRef.fn?.();
        streamCleanupRef.current = null;
      };
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
        conversationId: conversationIdRef.current ?? undefined,
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
            const hasVisible = hasVisibleAssistantAnswer(
              clean || rawAnswer,
              turn.busy ? turn.streamSections : null,
              { streaming: turn.busy },
            );
            const waitingFirstToken = turn.busy && !hasVisible;
            const sectionTitle = turn.busy
              ? currentWritingSectionTitle(turn.streamSections)
              : undefined;
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
                          turn.id === activeTurnId
                            ? streamPhase
                            : turn.citations.length
                              ? 'refs'
                              : 'understanding'
                        }
                        citeCount={turn.citations.length}
                        slow={streamSlowHint && turn.id === activeTurnId}
                        currentSectionTitle={sectionTitle}
                      />
                    ) : hasVisible || !turn.busy ? (
                      <>
                        {!hasError && !turn.busy ? (
                          <>
                            <InstantAnswerStatus
                              instant={turn.instant}
                              cacheSource={turn.cacheSource}
                              local={turn.localInstant}
                            />
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
                          </>
                        ) : null}
                        <AnswerView
                          text={clean || rawAnswer}
                          streaming={turn.busy}
                          dense={turn.scene === 'verse_quick'}
                          responseProfile={turn.responseProfile}
                          structureAssets={turn.structureAssets}
                          streamSections={
                            turn.busy && turn.streamSections?.length
                              ? turn.streamSections
                              : undefined
                          }
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
