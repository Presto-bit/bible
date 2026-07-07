'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { chatStream, type Citation } from '@/lib/api';
import AnswerText from '@/components/AnswerText';
import { useToast } from '@/components/ui/ToastProvider';
import { CitationBar } from '@/components/CitationBar';
import { addThought } from '@/lib/reader_thoughts';
import {
  recordCitationClick,
  recordSaveAnswerNote,
  recordShareAnswer,
  recordXiaoAiFollowup,
  recordXiaoAiQuestion,
} from '@/lib/badge_events';
import { bodyText, followupsForMessage, followupsOf, stripFollowups } from '@/lib/assistant_format';
import { resolveScene, refForChatTurn, SCENES, type AssistantScene } from '@/lib/assistant_scenes';
import { bumpAndEnqueueAiSession } from '@/lib/ai_session_sync';
import { personalizedAssistantChips } from '@/lib/assistant_personalize';
import { staticAssistantChips } from '@/lib/assistant_chip_prompts';
import {
  clearAssistantDraft,
  loadAssistantDraft,
  saveAssistantDraft,
} from '@/lib/assistant_session_draft';
import {
  findResumableSession,
  formatSessionUpdatedLabel,
  groupSessionsByDate,
  hasUserMessages,
  loadAssistantSessions,
  renameAssistantSession,
  deleteAssistantSession,
  saveAssistantSessions,
} from '@/lib/assistant_sessions';
import { readingStreak } from '@/lib/gamification';
import { consumeAssistantPrefill, explainVerseQuestion } from '@/lib/assistant_prefill';
import { buildAssistantReaderContext } from '@/lib/assistant_reader_context';
import { refToChineseLabel } from '@/lib/ref_label';
import { localizeCitations, citationsUsedInText } from '@/lib/citation_display';
import { HistorySessionSwipeRow } from '@/components/assistant/HistorySessionSwipeRow';
import {
  AssistantThinkingState,
  type ThinkingPhase,
} from '@/components/assistant/AssistantThinkingState';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  followups?: string[];
  scene?: string;
  sceneLabel?: string;
}

interface Session {
  id: string;
  title: string;
  ref: string;
  preview: string;
  updated: string;
  updatedAt?: number;
  msgs: Msg[];
}

function newSessionId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `s-${Date.now()}`;
}

export default function AssistantTab({ paneActive = true }: { paneActive?: boolean }) {
  return (
    <Suspense fallback={(
      <main className="container">
        <p className="muted">加载中…</p>
      </main>
    )}>
      <AssistantPageInner paneActive={paneActive} />
    </Suspense>
  );
}

function userVisibleQuestion(question: string, refVal: string): string {
  const isInternalPrompt =
    question.length > 120 ||
    /严格按以下|【经文原意】|不要输出【相关追问】/.test(question);
  if (!isInternalPrompt) return question;
  const cn = refToChineseLabel(refVal);
  return cn ? `关于 ${cn}` : '请教这段经文';
}

const SCROLL_NEAR_BOTTOM_PX = 96;

function isNearBottom(el: HTMLElement, threshold = SCROLL_NEAR_BOTTOM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function AssistantPageInner({ paneActive }: { paneActive: boolean }) {
  const flashToast = useToast();
  const [mode, setMode] = useState('understand');
  const [ref, setRef] = useState('');
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>('current');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seedBoot = useRef(false);
  const hydratedRef = useRef(false);
  const [citationOpen, setCitationOpen] = useState<number | null>(null);
  /** 哪一条助手消息正在展示脚标弹窗（FAB 带入的历史消息也要可点） */
  const [citationMsgIdx, setCitationMsgIdx] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const sessionScrollRef = useRef(true);
  /** 发送后默认锁滚（阅读优先）；用户滑到底或点「跟随」后解锁 */
  const streamFollowLockedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [streamPhase, setStreamPhase] = useState<ThinkingPhase>('understanding');
  const [streamCiteCount, setStreamCiteCount] = useState(0);
  const [slowHint, setSlowHint] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');

  const personalized = useMemo(
    () =>
      personalizedAssistantChips({
        ref: ref || undefined,
        streak: readingStreak(),
      }),
    [ref],
  );
  const sessionGroups = useMemo(() => groupSessionsByDate(sessions), [sessions]);
  const composerChips = useMemo(() => {
    const merged = [...personalized.slice(0, 2), ...staticAssistantChips(ref || undefined)];
    const seen = new Set<string>();
    return merged.filter((c) => {
      if (seen.has(c.label)) return false;
      seen.add(c.label);
      return true;
    });
  }, [personalized, ref]);

  useEffect(() => {
    if (!historyOpen) return;
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      for (const g of sessionGroups) {
        if (!(g.label in next)) next[g.label] = g.label !== '今天';
      }
      return next;
    });
  }, [historyOpen, sessionGroups]);

  const lastAssistantIdx = useMemo(() => {
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      if (msgs[i].role === 'assistant') return i;
    }
    return -1;
  }, [msgs]);

  const adjustInputHeight = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  useEffect(() => {
    adjustInputHeight();
  }, [input]);

  const copyText = async (t: string) => {
    try {
      await navigator.clipboard.writeText(stripFollowups(t));
      flashToast('已复制');
    } catch {
      flashToast('复制失败');
    }
  };
  const shareText = async (t: string) => {
    const text = stripFollowups(t);
    const nav = navigator as Navigator & { share?: (d: { text: string; title?: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: '小爱的解读', text });
        recordShareAnswer();
        return;
      } catch {
        /* 用户取消或失败，降级复制 */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      flashToast('已复制，可粘贴分享到群或动态');
    } catch {
      flashToast('分享失败');
    }
  };

  // 语音输入（Web Speech API）：长按说话、松开发送、上滑取消。
  const [voiceMode, setVoiceMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const recRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const transcriptRef = useRef('');
  const startYRef = useRef(0);
  const cancelRef = useRef(false);

  const startVoice = (e: React.PointerEvent) => {
    const SR =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    if (!SR) {
      flashToast('当前浏览器不支持语音输入，请用键盘');
      setVoiceMode(false);
      return;
    }
    startYRef.current = e.clientY;
    cancelRef.current = false;
    transcriptRef.current = '';
    setCancelArmed(false);
    setRecording(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new (SR as any)();
    rec.lang = 'zh-CN';
    rec.interimResults = true;
    rec.continuous = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (ev: any) => {
      let t = '';
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      transcriptRef.current = t;
    };
    rec.onerror = () => {};
    recRef.current = { stop: () => rec.stop(), abort: () => rec.abort() };
    try {
      rec.start();
    } catch {
      /* 已在录音 */
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onVoiceMove = (e: React.PointerEvent) => {
    if (!recording) return;
    const armed = startYRef.current - e.clientY > 60;
    cancelRef.current = armed;
    setCancelArmed(armed);
  };

  const endVoice = () => {
    if (!recording) return;
    setRecording(false);
    const willCancel = cancelRef.current;
    setCancelArmed(false);
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      if (willCancel) rec.abort();
      else rec.stop();
    }
    // 给识别一点收尾时间再发送。
    setTimeout(() => {
      const text = transcriptRef.current.trim();
      transcriptRef.current = '';
      if (!willCancel && text) send(text);
    }, 250);
  };

  useEffect(() => {
    setSessions(loadAssistantSessions() as Session[]);
    document.documentElement.style.setProperty('--assistant-answer-font-size', '17px');
    return () => {
      document.documentElement.style.removeProperty('--assistant-answer-font-size');
    };
  }, []);

  useEffect(() => {
    if (!paneActive) return;
    document.body.classList.add('assistant-active');
    return () => {
      document.body.classList.remove('assistant-active');
    };
  }, [paneActive]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!hasUserMessages(msgs)) {
      clearAssistantDraft();
      return;
    }
    saveAssistantDraft({ activeId, msgs, ref, mode, updatedAt: Date.now() });
  }, [activeId, msgs, ref, mode]);

  const scrollThreadToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
  };

  const scrollToMsgStart = (msgIdx: number) => {
    const root = scrollRef.current;
    if (!root) return;
    const node = root.querySelector(`[data-msg-idx="${msgIdx}"]`);
    if (node instanceof HTMLElement) {
      root.scrollTo({ top: Math.max(0, node.offsetTop - 8), behavior: 'auto' });
      return;
    }
    scrollThreadToLatest();
  };

  /** 流式：锁滚时不跟滚；解锁后仅距底较近时跟随 */
  const maybeFollowStreamScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (streamFollowLockedRef.current) {
      setShowJumpToBottom(true);
      return;
    }
    if (isNearBottom(el)) {
      scrollThreadToLatest();
      setShowJumpToBottom(false);
    } else {
      setShowJumpToBottom(true);
    }
  };

  const unlockStreamFollow = (followNow = true) => {
    streamFollowLockedRef.current = false;
    setShowJumpToBottom(false);
    if (followNow) scrollThreadToLatest();
  };

  const handleThreadScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (isNearBottom(el)) {
      if (streamFollowLockedRef.current) {
        streamFollowLockedRef.current = false;
      }
      setShowJumpToBottom(false);
      return;
    }
    if (busy && streamFollowLockedRef.current) {
      setShowJumpToBottom(true);
    }
  };

  /** 切换会话 / 进入历史：落在最新消息 */
  useEffect(() => {
    if (msgs.length === 0) return;
    if (!sessionScrollRef.current) {
      sessionScrollRef.current = true;
      return;
    }
    scrollThreadToLatest();
    const t = window.setTimeout(scrollThreadToLatest, 50);
    return () => window.clearTimeout(t);
  }, [activeId, msgs.length]);

  const persist = (nextMsgs: Msg[], anchor: string) => {
    if (!hasUserMessages(nextMsgs)) return;
    const anchorRef = (anchor || ref).trim();
    let sid = activeId;
    if (sid === 'current') {
      const pool = loadAssistantSessions() as Session[];
      const existing = findResumableSession(pool, anchorRef);
      sid = existing?.id ?? newSessionId();
      setActiveId(sid);
    }
    const title = nextMsgs.find((m) => m.role === 'user')?.text.slice(0, 18) || anchorRef || '新会话';
    const preview = nextMsgs[nextMsgs.length - 1]?.text.slice(0, 40) || '';
    const now = Date.now();
    const updatedLabel = formatSessionUpdatedLabel(now);
    setSessions((prev) => {
      const rest = prev.filter((s) => s.id !== sid);
      const next: Session = {
        id: sid,
        title,
        ref: anchorRef,
        preview,
        updated: updatedLabel,
        updatedAt: now,
        msgs: nextMsgs,
      };
      const list = [next, ...rest];
      saveAssistantSessions(list);
      bumpAndEnqueueAiSession(sid, title, anchorRef);
      return list;
    });
  };

  const cancelStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setSlowHint(false);
    setStreamPhase('understanding');
    setStreamCiteCount(0);
    setMsgs((prev) => {
      if (!prev.length || prev[prev.length - 1].role !== 'assistant') return prev;
      const last = prev[prev.length - 1];
      if (last.text.trim()) return prev;
      const copy = [...prev];
      copy[copy.length - 1] = { ...last, text: '（已停止生成）' };
      return copy;
    });
  };

  const send = async (
    question?: string,
    nextMode?: string,
    refOverride?: string,
    /** 气泡展示文案；不传则与 question 相同 */
    displayText?: string,
    nextScene?: AssistantScene,
    surface?: string,
  ) => {
    const q = (question ?? input).trim();
    if (!q || busy) return;
    const shown = (displayText ?? q).trim() || q;
    const m = nextMode ?? mode;
    const anchor = (refOverride ?? ref).trim() || null;
    const history = msgs
      .filter((msg) => msg.text.trim())
      .map((msg) => ({
        role: msg.role,
        content: msg.role === 'assistant' ? bodyText(msg.text) : msg.text,
      }));
    const refForApi = refForChatTurn(anchor, history.length);
    const scene = nextScene && refForApi
      ? nextScene
      : resolveScene(nextScene, m, Boolean(refForApi));
    const userMsgsInSession = msgs.filter((msg) => msg.role === 'user').length + 1;
    recordXiaoAiQuestion({ scene, ref: refForApi ?? undefined });
    recordXiaoAiFollowup(userMsgsInSession);
    setMode(m);
    setInput('');
    const base: Msg[] = [...msgs, { role: 'user', text: shown }, { role: 'assistant', text: '' }];
    const assistantMsgIdx = base.length - 1;
    sessionScrollRef.current = false;
    streamFollowLockedRef.current = true;
    setMsgs(base);
    setBusy(true);
    setPendingQuestion(shown);
    setStreamPhase('understanding');
    setStreamCiteCount(0);
    setSlowHint(false);
    setShowJumpToBottom(false);
    abortRef.current = new AbortController();
    const slowTimer = window.setTimeout(() => setSlowHint(true), 15000);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToMsgStart(assistantMsgIdx));
    });
    let acc = '';
    let cites: Citation[] = [];
    let serverFollowups: string[] = [];
    let sceneLabel = SCENES[scene].label;
    let gotDelta = false;
    const applyAcc = () => {
      rafRef.current = null;
      setMsgs((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: 'assistant',
          text: acc,
          citations: citationsUsedInText(acc, cites),
          followups: serverFollowups,
          scene,
          sceneLabel,
        };
        return copy;
      });
      maybeFollowStreamScroll();
    };
    const scheduleApply = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(applyAcc);
    };
    await chatStream(
      {
        ref: refForApi,
        question: q,
        mode: m,
        scene,
        history,
        surface,
        reader_context: buildAssistantReaderContext(),
      },
      {
        onMeta: (meta) => {
          const book = refToChineseLabel(anchor)?.replace(/\s*\d+.*$/, '').trim();
          cites = localizeCitations(meta.citations || [], book || undefined);
          if (meta.scene_label) sceneLabel = meta.scene_label;
          setStreamCiteCount(cites.length);
          setStreamPhase('refs');
        },
        onDelta: (t) => {
          if (!gotDelta) {
            gotDelta = true;
            setStreamPhase('writing');
          }
          acc += t;
          scheduleApply();
        },
        onFollowups: (items) => {
          serverFollowups = items;
        },
        onError: (msg) => {
          acc = `⚠️ ${msg}`;
          applyAcc();
        },
        onDone: (payload) => {
          if (payload?.followups?.length) serverFollowups = payload.followups;
        },
      },
      { signal: abortRef.current.signal },
    );
    window.clearTimeout(slowTimer);
    abortRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    applyAcc();
    setBusy(false);
    setSlowHint(false);
    const el = scrollRef.current;
    if (streamFollowLockedRef.current && el && !isNearBottom(el)) {
      setShowJumpToBottom(true);
    } else {
      setShowJumpToBottom(false);
    }
    setMsgs((prev) => {
      persist(prev, anchor ?? ref);
      return prev;
    });
  };

  const sendRef = useRef(send);
  sendRef.current = send;
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const sid = searchParams.get('sid');
    const legacyQ = searchParams.get('q');
    const autoSendParam = searchParams.get('auto_send') === '1';
    const refParam = searchParams.get('ref') || '';
    const storedSessions = loadAssistantSessions() as Session[];

    let refVal = refParam;
    let question: string | null = null;
    let autoSend = autoSendParam;
    let skipInputPrefill = false;
    let handled = false;
    let prefillScene: AssistantScene | undefined;
    let prefillSurface: string | undefined;

    const resumeIfMatch = (anchor: string): boolean => {
      const existing = findResumableSession(storedSessions, anchor);
      if (!existing) return false;
      setActiveId(existing.id);
      setMsgs(existing.msgs);
      setRef(existing.ref);
      handled = true;
      skipInputPrefill = true;
      return true;
    };

    const isTopicLike = (surface?: string, scene?: string) =>
      surface === 'topic' || surface === 'graph_topic' || scene === 'graph_topic';

    if (sid) {
      const payload = consumeAssistantPrefill(sid);
      if (payload) {
        handled = true;
        clearAssistantDraft();
        const topicFlow = isTopicLike(payload.surface, payload.scene);
        if (topicFlow) {
          refVal = '';
          question = payload.question;
        } else {
          refVal = payload.ref || refVal;
          const resumed = refVal ? resumeIfMatch(refVal) : false;
          if (!resumed && payload.seedMessages?.length) {
            setMsgs(
              payload.seedMessages.map((m) => ({
                role: m.role,
                text: m.text,
                citations: m.citations,
                scene: m.scene,
                sceneLabel: m.sceneLabel,
              })),
            );
            skipInputPrefill = true;
          } else if (!resumed) {
            question = payload.question;
          }
        }
        if (payload.autoSend) autoSend = true;
        if (topicFlow) {
          prefillScene = 'chat_general';
          setMode(SCENES.chat_general.mode);
        } else if (payload.scene) {
          prefillScene = resolveScene(payload.scene, mode, Boolean(refVal));
          setMode(SCENES[prefillScene].mode);
        }
        prefillSurface = payload.surface;
      } else {
        // sid 无效时不恢复旧草稿，避免填入无关读经位置
        handled = true;
        refVal = refParam;
      }
    } else {
      const draft = loadAssistantDraft();
      if (draft && hasUserMessages(draft.msgs)) {
        handled = true;
        setActiveId(draft.activeId);
        setMsgs(draft.msgs);
        setRef(draft.ref);
        setMode(draft.mode);
        skipInputPrefill = true;
        refVal = draft.ref || refVal;
      } else if (draft) {
        clearAssistantDraft();
      }
      if (!handled && refVal && resumeIfMatch(refVal)) {
        /* 已续接 */
      }
    }

    if (!skipInputPrefill && !autoSend) {
      if (!question && legacyQ) question = decodeURIComponent(legacyQ);
      if (!question && refVal && !isTopicLike(prefillSurface, prefillScene)) {
        question = explainVerseQuestion(refVal);
      }
      if (question) setInput(question);
    }
    if (handled && refVal && !isTopicLike(prefillSurface, prefillScene)) setRef(refVal);
    else if (!handled && refParam) setRef(refParam);

    if (question && autoSend && !seedBoot.current) {
      const scene = prefillScene ?? (refVal ? 'chat_explain' : 'chat_general');
      seedBoot.current = true;
      void sendRef.current(
        question,
        SCENES[scene].mode,
        refVal,
        userVisibleQuestion(question, refVal),
        scene,
        prefillSurface,
      );
    }

    if (sid || legacyQ || autoSendParam) {
      router.replace('/assistant', { scroll: false });
    }

    hydratedRef.current = true;
  }, [searchParams, router]);

  const startNewSession = () => {
    streamFollowLockedRef.current = false;
    setShowJumpToBottom(false);
    setActiveId('current');
    setMsgs([]);
    setInput('');
    setRef('');
    setHistoryOpen(false);
    clearAssistantDraft();
  };

  const openSession = (s: Session) => {
    streamFollowLockedRef.current = false;
    setShowJumpToBottom(false);
    setActiveId(s.id);
    setMsgs(s.msgs);
    setRef(s.ref);
    setHistoryOpen(false);
  };

  const handleRenameSession = (s: Session) => {
    const next = window.prompt('重命名会话', s.title);
    if (!next?.trim()) return;
    const title = next.trim();
    renameAssistantSession(s.id, title);
    bumpAndEnqueueAiSession(s.id, title, s.ref, false);
    setSessions(loadAssistantSessions() as Session[]);
  };

  const handleDeleteSession = (s: Session) => {
    if (!window.confirm(`删除「${s.title}」？本地消息将无法恢复。`)) return;
    deleteAssistantSession(s.id);
    bumpAndEnqueueAiSession(s.id, s.title, s.ref, true);
    setSessions(loadAssistantSessions() as Session[]);
    if (activeId === s.id) {
      startNewSession();
    }
  };

  const priorFollowupContext = (uptoIdx: number) => {
    const priorUserQuestions: string[] = [];
    const priorFollowups: string[] = [];
    for (let i = 0; i < uptoIdx; i += 1) {
      const m = msgs[i];
      if (m.role === 'user') priorUserQuestions.push(m.text);
      if (m.role === 'assistant' && m.text) priorFollowups.push(...followupsOf(m.text));
    }
    return { priorUserQuestions, priorFollowups };
  };

  const composer = (
    <div className="assistant-composer">
      <div className="chip-swipe">
        {composerChips.map((c) => (
          <button
            key={c.label}
            type="button"
            className="chip-swipe-item"
            disabled={busy}
            onClick={() => send(c.q, c.mode, undefined, c.label, c.scene)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="assistant-compose">
        <div className="compose-input-wrap">
          {voiceMode ? (
            <button
              type="button"
              className={`voice-hold ${recording ? (cancelArmed ? 'voice-cancel' : 'voice-active') : ''}`}
              disabled={busy}
              onPointerDown={startVoice}
              onPointerMove={onVoiceMove}
              onPointerUp={endVoice}
              onPointerCancel={endVoice}
            >
              {recording ? (cancelArmed ? '松开取消' : '松开发送 · 上滑取消') : '按住 说话'}
            </button>
          ) : (
            <textarea
              ref={inputRef}
              rows={1}
              className={`compose-input compose-textarea${busy ? ' compose-textarea-busy' : ''}`}
              placeholder="问小爱…"
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
          )}
          {busy ? (
            <button
              type="button"
              className="compose-stop-inner is-active"
              aria-label="停止生成"
              onClick={cancelStream}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="7" y="7" width="10" height="10" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="compose-mode-inner"
              aria-label={voiceMode ? '切换键盘' : '切换语音'}
              onClick={() => setVoiceMode((v) => !v)}
            >
              {voiceMode ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="8" width="18" height="11" rx="2" />
                  <path d="M7 11h0M11 11h0M15 11h0M7 15h10" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <main className="container assistant-page" aria-hidden={!paneActive}>
      <header className="assistant-head">
        <button type="button" className="assistant-title-btn" onClick={() => setHistoryOpen(true)}>
          <strong>小爱</strong>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-7 3.3" />
            <path d="M3 4v4h4" />
            <path d="M12 8v4l3 2" />
          </svg>
        </button>
        <div className="assistant-head-actions">
          {ref ? (
            <Link href="/reader" className="rail-cta">
              {refToChineseLabel(ref) ?? ref} ›
            </Link>
          ) : (
            <span />
          )}
        </div>
      </header>

      <div className="assistant-body">
        <div className="assistant-thread-wrap">
          <div
            ref={scrollRef}
            className="assistant-thread"
            onScroll={handleThreadScroll}
          >
            {msgs.length === 0 && (
              <div className="assistant-empty-hint">
                <p className="muted" style={{ fontSize: 13, lineHeight: 1.65, margin: '0 0 12px', padding: '0 4px' }}>
                  我是小爱，可以帮你查经文、解经义、整理笔记。需要联网。
                </p>
                <div className="empty-pills">
                  {personalized.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      className="font-pill"
                      disabled={busy}
                      onClick={() => send(c.q, c.mode, undefined, c.label, c.scene)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => {
              const isLastAssistant = m.role === 'assistant' && i === lastAssistantIdx;
              const showFollowups = isLastAssistant && m.text && !busy;
              const followups = showFollowups
                ? followupsForMessage(m.text, {
                    ...priorFollowupContext(i + 1),
                    priorFollowups: [
                      ...priorFollowupContext(i + 1).priorFollowups,
                      ...(m.followups ?? []),
                    ],
                  })
                : m.followups ?? [];
              const displayFollowups = showFollowups
                ? (m.followups?.length ? m.followups : followups)
                : [];
              const showActions = m.role === 'assistant' && m.text && !busy;
              const isStreaming = isLastAssistant && busy;
              const usedCitations =
                m.role === 'assistant' && m.citations?.length
                  ? citationsUsedInText(m.text, m.citations)
                  : [];
              return (
              <div
                key={i}
                data-msg-idx={i}
                className={`assistant-msg ${m.role === 'user' ? 'assistant-msg-user' : ''}`}
              >
                {m.role === 'assistant' && (
                  <div className="muted assistant-msg-meta">
                    <span>小爱</span>
                    {m.sceneLabel && (
                      <span className="assistant-scene-tag">{m.sceneLabel}</span>
                    )}
                  </div>
                )}
                {m.role === 'assistant' ? (
                  m.text ? (
                    <div className="assistant-answer">
                      <AnswerText
                        text={m.text}
                        streaming={isStreaming}
                        dense={Boolean(m.scene?.startsWith('summary_'))}
                        citations={m.citations}
                        onCitationClick={(n) => {
                          recordCitationClick();
                          setCitationMsgIdx(i);
                          setCitationOpen(n);
                        }}
                      />
                    </div>
                  ) : (
                    <AssistantThinkingState
                      phase={isStreaming ? streamPhase : 'understanding'}
                      citeCount={streamCiteCount}
                      slow={isStreaming && slowHint}
                    />
                  )
                ) : (
                  <div className="assistant-user-block">
                    <div className="assistant-user-text">
                      {m.text || '…'}
                    </div>
                  </div>
                )}
                {showActions && (
                  <>
                    {displayFollowups.length > 0 && (
                      <div className="followup-row">
                        <span className="followup-row-label">相关追问</span>
                        {displayFollowups.map((q) => (
                          <button
                            key={q}
                            type="button"
                            className="followup-chip"
                            disabled={busy}
                            onClick={() => send(q, m.scene ? SCENES[resolveScene(m.scene, mode)].mode : 'explain', undefined, q, resolveScene(m.scene, mode))}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="msg-actions">
                      <button type="button" className="msg-action" onClick={() => copyText(m.text)}>
                        复制
                      </button>
                      <button
                        type="button"
                        className="msg-action"
                        onClick={() => {
                          if (ref) addThought(ref, stripFollowups(m.text), 'private', { skipPublish: true });
                          recordSaveAnswerNote();
                          flashToast('已存笔记');
                        }}
                      >
                        存笔记
                      </button>
                      <button type="button" className="msg-action" onClick={() => shareText(m.text)}>
                        分享
                      </button>
                      {usedCitations.length > 0 && (
                        <CitationBar
                          variant="action"
                          citations={usedCitations}
                          activeN={citationMsgIdx === i ? citationOpen : undefined}
                          onActiveChange={(n) => {
                            setCitationMsgIdx(i);
                            setCitationOpen(n);
                          }}
                          bookName={refToChineseLabel(ref)?.replace(/\s*\d+.*$/, '').trim()}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
            );
            })}
          </div>
          {showJumpToBottom ? (
            <button
              type="button"
              className="assistant-scroll-jump"
              aria-label="滚动到最新输出"
              onClick={() => unlockStreamFollow(true)}
            >
              {busy ? '↓ 跟随最新' : '↓ 查看全文'}
            </button>
          ) : null}
        </div>
        {composer}
      </div>

      {historyOpen && (
        <div className="drawer-backdrop" onClick={() => setHistoryOpen(false)}>
          <div className="drawer-left" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <strong>历史会话</strong>
              <button type="button" className="btn" style={{ marginTop: 0 }} onClick={startNewSession}>
                + 新会话
              </button>
            </div>
            {sessions.length === 0 ? (
              <p className="muted" style={{ marginTop: 10 }}>暂无历史会话，开始提问后会自动保存。</p>
            ) : (
              <div className="history-group-list" style={{ marginTop: 8 }}>
                {sessionGroups.map((group) => {
                  const collapsed = collapsedGroups[group.label] ?? group.label !== '今天';
                  return (
                    <div key={group.label} className="history-date-group">
                      <button
                        type="button"
                        className="history-date-head"
                        onClick={() =>
                          setCollapsedGroups((prev) => ({
                            ...prev,
                            [group.label]: !collapsed,
                          }))
                        }
                      >
                        <span>{group.label}</span>
                        <span className="muted" style={{ fontSize: 11 }}>
                          {group.items.length} 条 · {collapsed ? '展开' : '收起'}
                        </span>
                      </button>
                      {!collapsed && group.items.map((s) => (
                        <HistorySessionSwipeRow
                          key={s.id}
                          onOpen={() => openSession(s as Session)}
                          onRename={() => handleRenameSession(s as Session)}
                          onDelete={() => handleDeleteSession(s as Session)}
                        >
                          <div className="history-item">
                            <div className="history-item-top">
                              <span className="history-item-title">{s.title}</span>
                              <span className="muted" style={{ fontSize: 11 }}>
                                {formatSessionUpdatedLabel(s.updatedAt ?? Date.now())}
                              </span>
                            </div>
                            {s.ref && (
                              <span className="history-item-ref">
                                {refToChineseLabel(s.ref) ?? s.ref}
                              </span>
                            )}
                            {s.preview && (
                              <span className="muted history-item-preview">{s.preview}</span>
                            )}
                          </div>
                        </HistorySessionSwipeRow>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

    </main>
  );
}
