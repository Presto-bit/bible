'use client';

import '@/styles/assistant.css';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { chatStream, currentUserId, type Citation } from '@/lib/api';
import { fetchAiQuota, type AiQuota } from '@/lib/api/ai';
import Link from 'next/link';
import { useOnline } from '@/lib/use_online';
import AnswerText from '@/components/AnswerText';
import { useToast } from '@/components/ui/ToastProvider';
import { CitationBar } from '@/components/CitationBar';
import { CitationEvidenceRail } from '@/components/assistant/CitationEvidenceRail';
import { AssistantNextSteps } from '@/components/assistant/AssistantNextSteps';
import { AssistantUserBubble } from '@/components/assistant/AssistantUserBubble';
import { setAssistantStreamBusy } from '@/lib/assistant_stream_busy';
import { addThought } from '@/lib/reader_thoughts';
import {
  recordCitationClick,
  recordSaveAnswerNote,
  recordXiaoAiFollowup,
  recordXiaoAiQuestion,
} from '@/lib/badge_events';
import { bodyText, followupsForMessage, followupsOf, stripFollowups } from '@/lib/assistant_format';
import { resolveScene, refForChatTurn, SCENES, type AssistantScene } from '@/lib/assistant_scenes';
import { detectsViewpointsIntent } from '@/lib/assistant_viewpoints';
import { bumpAndEnqueueAiSession } from '@/lib/ai_session_sync';
import { personalizedAssistantChips } from '@/lib/assistant_personalize';
import { staticAssistantChips } from '@/lib/assistant_chip_prompts';
import {
  clearAssistantDraft,
  loadAssistantDraft,
  saveAssistantDraft,
} from '@/lib/assistant_session_draft';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';
import {
  findResumableSession,
  formatSessionUpdatedLabel,
  groupSessionsByRef,
  hasUserMessages,
  loadAssistantSessions,
  renameAssistantSession,
  deleteAssistantSession,
  saveAssistantSessions,
} from '@/lib/assistant_sessions';
import { readingStreak } from '@/lib/gamification';
import { consumeAssistantPrefill, explainVerseQuestion } from '@/lib/assistant_prefill';
import { buildAssistantReaderContext } from '@/lib/assistant_reader_context';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { navigateToReaderHref } from '@/lib/pwa_tab_nav';
import { refToChineseLabel } from '@/lib/ref_label';
import { localizeCitations, citationsUsedInText } from '@/lib/citation_display';
import { HistorySessionSwipeRow } from '@/components/assistant/HistorySessionSwipeRow';
import AppBodyPortal from '@/components/AppBodyPortal';
import {
  AssistantThinkingState,
  type ThinkingPhase,
} from '@/components/assistant/AssistantThinkingState';
import { RagSourceStatus } from '@/components/assistant/RagSourceStatus';
import {
  KnowledgeBasePicker,
  DEFAULT_KB_ID,
} from '@/components/assistant/KnowledgeBasePicker';
import {
  getSessionKnowledgeBaseId,
  resetSessionKnowledgeBaseId,
  setSessionKnowledgeBaseId,
} from '@/lib/assistant_knowledge_base';
import { ASSISTANT_EMPTY_DEMOS } from '@/lib/assistant_empty_demos';
import { AnalysisShareSheet } from '@/components/AnalysisShareSheet';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  followups?: string[];
  scene?: string;
  sceneLabel?: string;
  /** 本次是否走过 RAG；undefined 表示未知（旧会话） */
  useRag?: boolean;
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  instantHint?: string;
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

/** 失败 / 中断等待用户重试的回复（与 send 里 ⚠️ · cancel 文案对齐） */
function isAssistantRegenCandidate(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.startsWith('⚠️')) return true;
  if (t === '（已停止生成）' || t.includes('已停止生成')) return true;
  return false;
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
  const online = useOnline();
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
  const seedBoot = useRef<string | false>(false);
  const hydratedRef = useRef(false);
  const [citationOpen, setCitationOpen] = useState<number | null>(null);
  /** 哪一条助手消息正在展示脚标弹窗（FAB 带入的历史消息也要可点） */
  const [citationMsgIdx, setCitationMsgIdx] = useState<number | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    text: string;
    citations?: Citation[];
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const sessionScrollRef = useRef(true);
  /** 发送后默认锁滚（阅读优先）；用户滑到底或点「跟随」后解锁 */
  const streamFollowLockedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [streamPhase, setStreamPhase] = useState<ThinkingPhase>('understanding');
  const [streamCiteCount, setStreamCiteCount] = useState(0);
  const [aiQuota, setAiQuota] = useState<AiQuota | null>(null);
  const [knowledgeBaseId, setKnowledgeBaseIdState] = useState(DEFAULT_KB_ID);
  const setKnowledgeBaseId = (id: string) => {
    setKnowledgeBaseIdState(id);
    setSessionKnowledgeBaseId(id);
  };

  useEffect(() => {
    if (!paneActive || currentUserId()) return;
    void fetchAiQuota().then(setAiQuota);
  }, [paneActive, busy]);
  const [slowHint, setSlowHint] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);
  /** 程序改写输入后 remount，避免 iOS 把清空记入「撤销键入」栈 */
  const [composerNonce, setComposerNonce] = useState(0);

  const replaceComposerValue = (next: string) => {
    inputRef.current?.blur();
    setInput(next);
    setComposerNonce((n) => n + 1);
  };

  const personalized = useMemo(
    () =>
      personalizedAssistantChips({
        ref: ref || undefined,
        streak: readingStreak(),
      }),
    [ref],
  );
  const sessionGroups = useMemo(() => groupSessionsByRef(sessions), [sessions]);
  const composerChips = useMemo(() => {
    const merged = [...personalized, ...staticAssistantChips(ref || undefined)];
    const seen = new Set<string>();
    return merged.filter((c) => {
      if (c.label === '续读导读') return false;
      if (seen.has(c.label)) return false;
      seen.add(c.label);
      return true;
    });
  }, [personalized, ref]);

  const readerHref = useMemo(() => (ref ? readerHrefFromRef(ref) : null), [ref]);

  useEffect(() => {
    if (!historyOpen) return;
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      sessionGroups.forEach((g, i) => {
        if (!(g.label in next)) next[g.label] = i !== 0;
      });
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
  const shareAnswer = (t: string, cites?: Citation[]) => {
    setShareTarget({ text: stripFollowups(t), citations: cites });
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

  const assistantWasActiveRef = useRef(false);

  const clearAssistantChrome = () => {
    document.body.classList.remove(
      'assistant-active',
      'assistant-immersive',
      'assistant-tabbar-peek',
      'assistant-keyboard',
      'assistant-keyboard-vv',
    );
    document.documentElement.style.removeProperty('--assistant-vv-h');
    document.documentElement.style.removeProperty('--assistant-kb-inset');
  };

  /** 底栏常驻；仅输入聚焦时进入键盘态并略上抬输入区 */
  useEffect(() => {
    if (!paneActive) {
      assistantWasActiveRef.current = false;
      setComposerFocused(false);
      clearAssistantChrome();
      return;
    }
    // 必须同步挂上 assistant-active：延后时 .app-body 仍带 tabbar padding，
    // 而 .assistant-page 已减 tabbar-h → 首帧/TWA 像「只剩半屏」。
    // paneActive 为真时直接挂：勿再查 DOM 门控（KeepAlive 切换瞬间可能误判）。
    document.body.classList.add('assistant-active');
    document.body.classList.remove('assistant-immersive', 'assistant-tabbar-peek');
    assistantWasActiveRef.current = true;
    return () => {
      clearAssistantChrome();
    };
  }, [paneActive]);

  useEffect(() => () => clearAssistantChrome(), []);

  useEffect(() => {
    if (!paneActive) return;
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    let raf = 0;
    /** 相对键盘顶再上抬，避免输入框被挡 */
    const LIFT_PX = 20;

    const pinScroll = () => {
      window.scrollTo(0, 0);
      root.scrollTop = 0;
      body.scrollTop = 0;
      const app = document.querySelector('.app-body');
      if (app instanceof HTMLElement) app.scrollTop = 0;
    };

    const syncViewport = () => {
      const ae = document.activeElement;
      const inComposer =
        ae instanceof HTMLElement
        && Boolean(ae.closest('.assistant-composer'))
        && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT');

      // 未真正聚焦输入：绝不锁 half-height，防系统栏/手势条误判
      if (!composerFocused || !inComposer) {
        body.classList.remove('assistant-keyboard', 'assistant-keyboard-vv');
        root.style.removeProperty('--assistant-vv-h');
        root.style.removeProperty('--assistant-kb-inset');
        return;
      }

      body.classList.add('assistant-keyboard');
      pinScroll();
      const layoutH = window.innerHeight || root.clientHeight || 0;
      const vvH = vv?.height ?? layoutH;
      const offsetTop = vv?.offsetTop ?? 0;
      const gap = Math.max(0, Math.round(layoutH - (vvH + offsetTop)));
      // 壳 WebView 系统栏也会带来缺口；阈值须低于真键盘（常 ≥180），又高于手势条抖动
      const gapFloor = isPeiaiAndroidShell() ? 72 : 48;
      if (gap > gapFloor) {
        // 键盘态底栏已藏：高度对齐可视区底沿，输入贴在键盘上方
        const pageH = Math.max(160, Math.round(vvH + offsetTop) - LIFT_PX);
        root.style.setProperty('--assistant-vv-h', `${pageH}px`);
        body.classList.add('assistant-keyboard-vv');
        root.style.setProperty('--assistant-kb-inset', `${LIFT_PX}px`);
      } else {
        root.style.removeProperty('--assistant-vv-h');
        body.classList.remove('assistant-keyboard-vv');
        // 未检出键盘时勿加大底 padding，避免输入悬在 Tab 与纸色之间
        root.style.setProperty('--assistant-kb-inset', '8px');
      }
    };

    const onViewport = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncViewport);
    };

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (!t.closest('.assistant-composer')) return;
      if (t.tagName !== 'TEXTAREA' && t.tagName !== 'INPUT') return;
      setComposerFocused(true);
      pinScroll();
    };

    const onFocusOut = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.closest('.assistant-composer')) return;
      const next = e.relatedTarget;
      if (next instanceof HTMLElement && next.closest('.assistant-composer')) return;
      setComposerFocused(false);
    };

    const onWindowScroll = () => {
      if (composerFocused) pinScroll();
    };

    syncViewport();
    vv?.addEventListener('resize', onViewport);
    vv?.addEventListener('scroll', onViewport);
    window.addEventListener('resize', onViewport);
    window.addEventListener('orientationchange', onViewport);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    window.addEventListener('scroll', onWindowScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
      window.removeEventListener('orientationchange', onViewport);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('scroll', onWindowScroll);
      body.classList.remove('assistant-keyboard', 'assistant-keyboard-vv');
      root.style.removeProperty('--assistant-vv-h');
      root.style.removeProperty('--assistant-kb-inset');
    };
  }, [paneActive, composerFocused]);

  useEffect(() => {
    if (paneActive) return;
    inputRef.current?.blur();
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.closest('.assistant-page')) el.blur();
    setHistoryOpen(false);
    setShareTarget(null);
    setCitationOpen(null);
    setCitationMsgIdx(null);
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
      streamFollowLockedRef.current = false;
      setShowJumpToBottom(false);
      return;
    }
    // 用户上滑离开底部：暂停跟滚，保留「跟随最新 / 查看全文」
    if (busy) {
      streamFollowLockedRef.current = true;
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
    const scroll = () => scrollThreadToLatest();
    scroll();
    const t1 = window.setTimeout(scroll, 50);
    const t2 = window.setTimeout(scroll, 200);
    let ro: ResizeObserver | undefined;
    const el = scrollRef.current;
    if (el && typeof ResizeObserver !== 'undefined') {
      let ticks = 0;
      ro = new ResizeObserver(() => {
        scroll();
        ticks += 1;
        if (ticks >= 8) ro?.disconnect();
      });
      ro.observe(el);
    }
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
    };
  }, [activeId, msgs.length]);

  /** 切回小爱 Tab / App 从后台恢复：默认滚到最新输出 */
  useEffect(() => {
    if (!paneActive || msgs.length === 0) return;
    streamFollowLockedRef.current = false;
    setShowJumpToBottom(false);
    sessionScrollRef.current = true;
    const scroll = () => scrollThreadToLatest();
    scroll();
    requestAnimationFrame(() => requestAnimationFrame(scroll));
    const t = window.setTimeout(scroll, 120);
    return () => window.clearTimeout(t);
  }, [paneActive, msgs.length]);

  useEffect(() => {
    if (!paneActive || msgs.length === 0) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      streamFollowLockedRef.current = false;
      setShowJumpToBottom(false);
      sessionScrollRef.current = true;
      scrollThreadToLatest();
      window.setTimeout(scrollThreadToLatest, 120);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [paneActive, msgs.length]);

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
    if (rafRef.current != null) {
      window.clearTimeout(rafRef.current);
      rafRef.current = null;
    }
    setBusy(false);
    setAssistantStreamBusy(false);
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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      setAssistantStreamBusy(false);
    };
  }, []);

  const send = async (
    question?: string,
    nextMode?: string,
    refOverride?: string,
    /** 气泡展示文案；不传则与 question 相同 */
    displayText?: string,
    nextScene?: AssistantScene,
    surface?: string,
    /** 重新生成：以该历史为前缀（不含本轮 user/assistant） */
    opts?: { historyBase?: Msg[] },
  ) => {
    const q = (question ?? input).trim();
    if (!q || busy) return;
    const shown = (displayText ?? q).trim() || q;
    const m = nextMode ?? mode;
    const anchor = (refOverride ?? ref).trim() || null;
    const thread = opts?.historyBase ?? msgs;
    const history = thread
      .filter((msg) => msg.text.trim())
      .map((msg) => ({
        role: msg.role,
        content: msg.role === 'assistant' ? bodyText(msg.text) : msg.text,
      }));
    const refForApi = refForChatTurn(anchor, history.length);
    let scene = nextScene && refForApi
      ? nextScene
      : resolveScene(nextScene, m, Boolean(refForApi));
    // 用户显式要「争议/并列」且未指定其他 scene 时，走并列观点模板
    if (!nextScene && detectsViewpointsIntent(q)) {
      scene = 'chat_viewpoints';
    }
    const userMsgsInSession = thread.filter((msg) => msg.role === 'user').length + 1;
    recordXiaoAiQuestion({ scene, ref: refForApi ?? undefined });
    recordXiaoAiFollowup(userMsgsInSession);
    void import('@/lib/product_events').then((m) =>
      m.trackProductEvent('ai_ask', {
        props: { scene, surface: surface || 'assistant' },
      }),
    );
    setMode(m);
    replaceComposerValue('');
    const base: Msg[] = [...thread, { role: 'user', text: shown }, { role: 'assistant', text: '' }];
    sessionScrollRef.current = false;
    // 默认跟滚看全文；用户上滑后才锁滚并出现「跟随最新」
    streamFollowLockedRef.current = false;
    setMsgs(base);
    setBusy(true);
    setAssistantStreamBusy(true);
    setPendingQuestion(shown);
    setStreamPhase('understanding');
    setStreamCiteCount(0);
    setSlowHint(false);
    setShowJumpToBottom(false);
    abortRef.current = new AbortController();
    const slowTimer = window.setTimeout(() => setSlowHint(true), 15000);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollThreadToLatest());
    });
    let acc = '';
    let cites: Citation[] = [];
    let useRag: boolean | undefined;
    let kbId = knowledgeBaseId;
    let kbName: string | undefined;
    let instantHint: string | undefined;
    let serverFollowups: string[] = [];
    let sceneLabel = SCENES[scene].label;
    let gotDelta = false;
    const applyAcc = () => {
      rafRef.current = null;
      setMsgs((prev) => {
        if (!prev.length || prev[prev.length - 1]?.role !== 'assistant') return prev;
        const copy = prev.slice();
        const last = prev[prev.length - 1]!;
        copy[copy.length - 1] = {
          ...last,
          role: 'assistant',
          text: acc,
          citations: citationsUsedInText(acc, cites),
          followups: serverFollowups,
          scene,
          sceneLabel,
          useRag,
          knowledgeBaseId: kbId,
          knowledgeBaseName: kbName,
          instantHint,
        };
        return copy;
      });
      maybeFollowStreamScroll();
    };
    /** 节流：约 12–15fps，减轻整表重渲染卡顿 */
    const scheduleApply = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.setTimeout(applyAcc, 72) as unknown as number;
    };
    try {
      await chatStream(
        {
          ref: refForApi,
          question: q,
          mode: m,
          scene,
          history,
          surface,
          reader_context: buildAssistantReaderContext(),
          knowledge_base_id: undefined,
        },
        {
          onMeta: (meta) => {
            if (meta.quota && meta.quota.limit > 0) {
              setAiQuota({
                used: meta.quota.used,
                limit: meta.quota.limit,
                unlimited: false,
              });
            } else if (meta.quota) {
              setAiQuota({ used: 0, limit: 0, unlimited: true });
            }
            const book = refToChineseLabel(anchor)?.replace(/\s*\d+.*$/, '').trim();
            cites = localizeCitations(meta.citations || [], book || undefined);
            if (typeof meta.use_rag === 'boolean') useRag = meta.use_rag;
            if (meta.scene_label) sceneLabel = meta.scene_label;
            if (meta.knowledge_base_id) kbId = meta.knowledge_base_id;
            if (meta.knowledge_base_name) kbName = meta.knowledge_base_name;
            if (meta.cache_hit || meta.instant) {
              instantHint =
                meta.cache_source === 'prewarm' ? '已预读这节 · 秒回' : '缓存 · 秒回';
            }
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
    } finally {
      window.clearTimeout(slowTimer);
      abortRef.current = null;
      if (rafRef.current != null) {
        window.clearTimeout(rafRef.current);
        rafRef.current = null;
      }
      applyAcc();
      setBusy(false);
      setAssistantStreamBusy(false);
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
    }
  };

  /** 失败 / 中断：丢掉本轮，用上一条用户问题再生成一次 */
  const regenerateAssistantAt = (assistantIdx: number) => {
    if (busy) return;
    let userIdx = assistantIdx - 1;
    while (userIdx >= 0 && msgs[userIdx]?.role !== 'user') userIdx -= 1;
    if (userIdx < 0) return;
    const userMsg = msgs[userIdx];
    const asst = msgs[assistantIdx];
    if (!userMsg?.text.trim()) return;
    const scene = asst?.scene && asst.scene in SCENES
      ? (asst.scene as AssistantScene)
      : undefined;
    const nextMode = scene ? SCENES[scene].mode : mode;
    void send(
      userMsg.text,
      nextMode,
      ref || undefined,
      userMsg.text,
      scene,
      undefined,
      { historyBase: msgs.slice(0, userIdx) },
    );
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
    const kbParam = searchParams.get('kb');
    const storedSessions = loadAssistantSessions() as Session[];

    if (kbParam) {
      setKnowledgeBaseId(kbParam);
    } else {
      setKnowledgeBaseIdState(getSessionKnowledgeBaseId());
    }

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
          // 今日经文入口：新开会话并自动发送，不续接旧聊、不停留在确认态
          if (payload.surface === 'home_daily_verse') {
            setActiveId('current');
            setMsgs([]);
            replaceComposerValue('');
            question = payload.question;
          } else {
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
      if (question) replaceComposerValue(question);
    }
    if (handled && refVal && !isTopicLike(prefillSurface, prefillScene)) setRef(refVal);
    else if (!handled && refParam) setRef(refParam);

    if (question && autoSend) {
      const bootKey = sid || `${refVal}|${question}|${prefillSurface || ''}`;
      if (seedBoot.current !== bootKey) {
        const scene = prefillScene ?? (refVal ? 'chat_explain' : 'chat_general');
        seedBoot.current = bootKey;
        void sendRef.current(
          question,
          SCENES[scene].mode,
          refVal,
          userVisibleQuestion(question, refVal),
          scene,
          prefillSurface,
        );
      }
    }

    if (sid || legacyQ || autoSendParam || kbParam) {
      router.replace('/assistant', { scroll: false });
    }

    hydratedRef.current = true;
  }, [searchParams, router]);

  const startNewSession = () => {
    streamFollowLockedRef.current = false;
    setShowJumpToBottom(false);
    setActiveId('current');
    setMsgs([]);
    replaceComposerValue('');
    setRef('');
    setKnowledgeBaseId(DEFAULT_KB_ID);
    resetSessionKnowledgeBaseId();
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
          <KnowledgeBasePicker disabled={busy} variant="embed" />
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
              key={composerNonce}
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
          {ref && readerHref ? (
            <button
              type="button"
              className="rail-cta"
              onClick={() => navigateToReaderHref(readerHref, router)}
            >
              {refToChineseLabel(ref) ?? ref} ›
            </button>
          ) : (
            <span />
          )}
        </div>
      </header>

      {!online ? (
        <p className="muted offline-page-hint" style={{ marginBottom: 8 }}>
          当前离线，小爱问答需联网后使用。
        </p>
      ) : null}

      {aiQuota && !aiQuota.unlimited && aiQuota.limit > 0 ? (
        <div
          className="assistant-quota-bar"
          style={{
            fontSize: 12,
            padding: '6px 12px',
            marginBottom: 8,
            borderRadius: 8,
            background: aiQuota.used >= aiQuota.limit ? 'var(--danger-soft, #fde8e8)' : 'var(--card-2)',
          }}
        >
          {aiQuota.used >= aiQuota.limit ? (
            <>
              今日免费次数已用完。
              <Link href="/profile" className="text-link" style={{ marginLeft: 6 }}>
                登录解锁更多
              </Link>
            </>
          ) : (
            <>今日 AI 剩余 {Math.max(0, aiQuota.limit - aiQuota.used)} / {aiQuota.limit} 次</>
          )}
        </div>
      ) : null}

      <div className={`assistant-body${msgs.length === 0 ? ' is-empty' : ''}`}>
        <div className="assistant-thread-wrap">
          <div
            ref={scrollRef}
            className="assistant-thread"
            onScroll={handleThreadScroll}
          >
            {msgs.length === 0 && (
              <div className="assistant-empty-hint">
                <div className="assistant-empty-scene" aria-hidden>
                  <span className="assistant-empty-scene-glow" />
                  <p className="assistant-empty-scene-kicker">小爱</p>
                  <p className="assistant-empty-scene-title">一起把经文聊明白</p>
                </div>
                <p className="muted assistant-empty-desc">
                  可结合释经资料回答；点下面试试，需要联网
                </p>
                <div className="empty-pills">
                  {ASSISTANT_EMPTY_DEMOS.map((c) => (
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
              const canRegen =
                m.role === 'assistant' &&
                isLastAssistant &&
                !busy &&
                isAssistantRegenCandidate(m.text);
              const showActions =
                m.role === 'assistant' && m.text && !busy && !canRegen;
              const isStreaming = isLastAssistant && busy;
              const usedCitations =
                m.role === 'assistant' && m.citations?.length
                  ? citationsUsedInText(m.text, m.citations)
                  : [];
              const regenBtn = canRegen ? (
                <button
                  type="button"
                  className="assistant-regen-btn"
                  aria-label="重新生成"
                  onClick={() => regenerateAssistantAt(i)}
                >
                  <svg
                    className="assistant-regen-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <polyline points="21 3 21 9 15 9" />
                  </svg>
                  <span>重新生成</span>
                </button>
              ) : null;
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
                    {m.scene === 'chat_viewpoints' && (
                      <span className="assistant-viewpoints-hint">
                        已并列常见理解 · 请核对来源
                      </span>
                    )}
                  </div>
                )}
                {m.role === 'assistant' ? (
                  m.text ? (
                    <div className="assistant-answer">
                      {!m.text.startsWith('⚠️') && (
                        <RagSourceStatus
                          count={
                            usedCitations.length > 0
                              ? usedCitations.length
                              : (m.citations?.length ?? 0)
                          }
                          useRag={
                            m.useRag
                            ?? (m.scene?.startsWith('summary_') ? false : undefined)
                          }
                          knowledgeBaseId={m.knowledgeBaseId}
                          knowledgeBaseName={m.knowledgeBaseName}
                          instantHint={m.instantHint}
                          onSwitchToPlatform={() => setKnowledgeBaseId(DEFAULT_KB_ID)}
                          onReview={
                            usedCitations.length > 0
                              ? () => {
                                  setCitationMsgIdx(i);
                                  setCitationOpen(usedCitations[0].n);
                                }
                              : undefined
                          }
                        />
                      )}
                      <div className="allow-text-select">
                        <AnswerText
                          text={m.text}
                          streaming={isStreaming}
                          dense={Boolean(m.scene?.startsWith('summary_'))}
                          onCitationClick={(n) => {
                            recordCitationClick();
                            setCitationMsgIdx(i);
                            setCitationOpen(n);
                          }}
                        />
                      </div>
                      {regenBtn}
                    </div>
                  ) : isStreaming ? (
                    <AssistantThinkingState
                      phase={streamPhase}
                      citeCount={streamCiteCount}
                      slow={slowHint}
                    />
                  ) : (
                    <div className="assistant-answer">
                      <p className="assistant-regen-empty muted">生成未完成</p>
                      {regenBtn}
                    </div>
                  )
                ) : (
                  <AssistantUserBubble
                    text={m.text || '…'}
                    disabled={busy}
                    paneActive={paneActive}
                    onCopy={() => {
                      void copyText(m.text);
                    }}
                    onEdit={() => {
                      replaceComposerValue(m.text);
                      requestAnimationFrame(() => {
                        inputRef.current?.focus();
                        adjustInputHeight();
                      });
                    }}
                    onResend={() => {
                      void send(m.text, mode, ref || undefined, m.text);
                    }}
                  />
                )}
                {showActions && (
                  <>
                    {usedCitations.length > 0 && (
                      <CitationEvidenceRail
                        citations={usedCitations}
                        bookName={refToChineseLabel(ref)?.replace(/\s*\d+.*$/, '').trim()}
                        onOpen={(n) => {
                          recordCitationClick();
                          setCitationMsgIdx(i);
                          setCitationOpen(n);
                        }}
                      />
                    )}
                    <AssistantNextSteps
                      showContinueRead={Boolean(ref && readerHrefFromRef(ref))}
                      onContinueRead={() => {
                        const href = ref ? readerHrefFromRef(ref) : null;
                        if (href) navigateToReaderHref(href, router);
                      }}
                      onSaveThought={() => {
                        addThought(ref || 'FREE', stripFollowups(m.text), 'private', {
                          skipPublish: true,
                        });
                        recordSaveAnswerNote();
                        flashToast('已存为想法（本机）');
                      }}
                      showSources={usedCitations.length > 0}
                      onOpenSources={() => {
                        if (usedCitations[0]) {
                          setCitationMsgIdx(i);
                          setCitationOpen(usedCitations[0].n);
                        }
                      }}
                      onCopy={() => copyText(m.text)}
                      onShare={() => shareAnswer(m.text, usedCitations)}
                    />
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
                    {usedCitations.length > 0 && (
                      <div className="xiaoai-cite-host">
                        <CitationBar
                          variant="action"
                          className="xiaoai-cite-host-trigger"
                          citations={usedCitations}
                          activeN={citationMsgIdx === i ? citationOpen : undefined}
                          onActiveChange={(n) => {
                            setCitationMsgIdx(i);
                            setCitationOpen(n);
                          }}
                          bookName={refToChineseLabel(ref)?.replace(/\s*\d+.*$/, '').trim()}
                        />
                      </div>
                    )}
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
        <AppBodyPortal onTabAway={() => setHistoryOpen(false)}>
          <div
            className="drawer-backdrop"
            data-dismiss-on-tab-nav
            onClick={() => setHistoryOpen(false)}
            role="presentation"
          >
            <div
              className="drawer-left assistant-history-drawer"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="历史会话"
            >
              <div className="section-row" style={{ marginTop: 0 }}>
                <strong>历史会话</strong>
                <button type="button" className="btn" style={{ marginTop: 0 }} onClick={startNewSession}>
                  + 新会话
                </button>
              </div>
              <div className="assistant-history-body">
                {sessions.length === 0 ? (
                  <p className="muted" style={{ marginTop: 10 }}>暂无历史会话，开始提问后会自动保存。</p>
                ) : (
                  <div className="history-group-list" style={{ marginTop: 8 }}>
                    {sessionGroups.map((group, gi) => {
                      const collapsed = collapsedGroups[group.label] ?? gi !== 0;
                      const headLabel =
                        group.label === '随问'
                          ? '随问'
                          : (refToChineseLabel(group.label) ?? group.label);
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
                            <span>{headLabel}</span>
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
              <p className="muted assistant-history-retention-hint">为你保留最近30天历史</p>
            </div>
          </div>
        </AppBodyPortal>
      )}

      {shareTarget ? (
        <AppBodyPortal onTabAway={() => setShareTarget(null)}>
          <AnalysisShareSheet
            refLabel={refToChineseLabel(ref) || ref || '小爱的解读'}
            refParam={ref || undefined}
            answerText={shareTarget.text}
            citations={shareTarget.citations}
            onClose={() => setShareTarget(null)}
            onToast={flashToast}
          />
        </AppBodyPortal>
      ) : null}

    </main>
  );
}
