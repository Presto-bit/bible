'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { chatStream, type Citation } from '@/lib/api';
import AnswerText from '@/components/AnswerText';
import { createNote } from '@/lib/notes';
import { followupsForMessage, followupsOf, stripFollowups } from '@/lib/assistant_format';
import { bumpAndEnqueueAiSession } from '@/lib/ai_session_sync';
import { personalizedAssistantChips } from '@/lib/assistant_personalize';
import { staticAssistantChips } from '@/lib/assistant_chip_prompts';
import {
  clearAssistantDraft,
  loadAssistantDraft,
  saveAssistantDraft,
} from '@/lib/assistant_session_draft';
import { readingStreak } from '@/lib/gamification';
import { consumeAssistantPrefill, explainVerseQuestion } from '@/lib/assistant_prefill';
import { refToChineseLabel } from '@/lib/ref_label';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
}

interface Session {
  id: string;
  title: string;
  ref: string;
  preview: string;
  updated: string;
  msgs: Msg[];
}

const SESSIONS_KEY = 'assistant_sessions_v1';

function loadSessions(): Session[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(list: Session[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(list.slice(0, 50)));
}

export default function AssistantPage() {
  return (
    <Suspense fallback={(
      <main className="container">
        <p className="muted">加载中…</p>
      </main>
    )}>
      <AssistantPageInner />
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

function AssistantPageInner() {
  const [mode, setMode] = useState('understand');
  const [ref, setRef] = useState('');
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>('current');
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seedBoot = useRef(false);
  const hydratedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const [toast, setToast] = useState('');
  const personalized = useMemo(
    () =>
      personalizedAssistantChips({
        ref: ref || undefined,
        streak: readingStreak(),
      }),
    [ref],
  );
  const composerChips = useMemo(
    () => [...personalized.slice(0, 2), ...staticAssistantChips(ref || undefined)],
    [personalized, ref],
  );

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

  const flashToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(''), 1800);
  };
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
    setSessions(loadSessions());
    const savedFont = Number(localStorage.getItem('readerFont'));
    if (savedFont) {
      document.documentElement.style.setProperty('--assistant-answer-font-size', `${savedFont}px`);
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveAssistantDraft({ activeId, msgs, ref, mode, updatedAt: Date.now() });
  }, [activeId, msgs, ref, mode]);

  const persist = (nextMsgs: Msg[], anchor: string) => {
    let sid = activeId;
    if (sid === 'current') {
      sid =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `s-${Date.now()}`;
      setActiveId(sid);
    }
    const title = nextMsgs.find((m) => m.role === 'user')?.text.slice(0, 18) || anchor || '新会话';
    const preview = nextMsgs[nextMsgs.length - 1]?.text.slice(0, 40) || '';
    setSessions((prev) => {
      const rest = prev.filter((s) => s.id !== sid);
      const next: Session = {
        id: sid,
        title,
        ref: anchor,
        preview,
        updated: '今天',
        msgs: nextMsgs,
      };
      const list = [next, ...rest];
      saveSessions(list);
      bumpAndEnqueueAiSession(sid, title, anchor);
      return list;
    });
  };

  const send = async (
    question?: string,
    nextMode?: string,
    refOverride?: string,
    /** 气泡展示文案；不传则与 question 相同 */
    displayText?: string,
  ) => {
    const q = (question ?? input).trim();
    if (!q || busy) return;
    const shown = (displayText ?? q).trim() || q;
    const m = nextMode ?? mode;
    const anchor = (refOverride ?? ref).trim() || null;
    setMode(m);
    setInput('');
    const base: Msg[] = [...msgs, { role: 'user', text: shown }, { role: 'assistant', text: '' }];
    setMsgs(base);
    setBusy(true);
    let acc = '';
    let cites: Citation[] = [];
    // rAF 节流：合并逐字增量，减少重渲染与滚动抖动（防闪屏）。
    const applyAcc = () => {
      rafRef.current = null;
      setMsgs((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', text: acc, citations: cites };
        return copy;
      });
      if (scrollRef.current) {
        scrollRef.current.scrollTo(0, scrollRef.current.scrollHeight);
      }
    };
    const scheduleApply = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(applyAcc);
    };
    await chatStream(
      { ref: anchor, question: q, mode: m },
      {
        onMeta: (meta) => {
          cites = meta.citations || [];
        },
        onDelta: (t) => {
          acc += t;
          scheduleApply();
        },
        onError: (msg) => {
          acc = `⚠️ ${msg}`;
          applyAcc();
        },
      },
    );
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    applyAcc();
    setBusy(false);
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

    let refVal = refParam;
    let question: string | null = null;
    let autoSend = autoSendParam;
    let skipInputPrefill = false;
    let handled = false;

    if (sid) {
      const payload = consumeAssistantPrefill(sid);
      if (payload) {
        handled = true;
        refVal = payload.ref || refVal;
        if (payload.seedMessages?.length) {
          setMsgs(payload.seedMessages.map((m) => ({ role: m.role, text: m.text })));
          skipInputPrefill = true;
        } else {
          question = payload.question;
        }
        if (payload.autoSend) autoSend = true;
      }
    } else {
      const draft = loadAssistantDraft();
      if (draft) {
        handled = true;
        setActiveId(draft.activeId);
        setMsgs(draft.msgs);
        setRef(draft.ref);
        setMode(draft.mode);
        skipInputPrefill = true;
        refVal = draft.ref || refVal;
      }
    }

    if (!skipInputPrefill && !autoSend) {
      if (!question && legacyQ) question = decodeURIComponent(legacyQ);
      if (!question && refVal) question = explainVerseQuestion(refVal);
      if (question) setInput(question);
    }
    if (handled && refVal) setRef(refVal);
    else if (!handled && refParam) setRef(refParam);

    if (refVal && question && autoSend && !seedBoot.current) {
      seedBoot.current = true;
      void sendRef.current(question, 'understand', refVal, userVisibleQuestion(question, refVal));
    }

    if (sid || legacyQ || autoSendParam) {
      router.replace('/assistant', { scroll: false });
    }

    hydratedRef.current = true;
  }, [searchParams, router]);

  const startNewSession = () => {
    setActiveId('current');
    setMsgs([]);
    setInput('');
    setHistoryOpen(false);
    clearAssistantDraft();
  };

  const openSession = (s: Session) => {
    setActiveId(s.id);
    setMsgs(s.msgs);
    setRef(s.ref);
    setHistoryOpen(false);
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
            onClick={() => send(c.q, c.mode, undefined, c.label)}
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
              className="compose-input compose-textarea"
              placeholder={ref ? `关于 ${refToChineseLabel(ref) ?? ref}，问小爱…` : '问小爱…'}
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
          <button
            type="button"
            className="compose-mode-inner"
            aria-label={voiceMode ? '切换键盘' : '切换语音'}
            disabled={busy}
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
        </div>
      </div>
    </div>
  );

  return (
    <main className="container assistant-page">
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
          <button type="button" className="text-link assistant-new-session" onClick={startNewSession}>
            新会话
          </button>
        </div>
      </header>

      {msgs.length === 0 ? (
        <div className="assistant-empty-fill">
          <div className="assistant-empty-hint">
            <div className="empty-pills">
              {personalized.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  className="font-pill"
                  disabled={busy}
                  onClick={() => send(c.q, c.mode, undefined, c.label)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {composer}
        </div>
      ) : (
        <div className="assistant-body">
          <div ref={scrollRef} className="assistant-thread">
            {msgs.map((m, i) => {
              const isLastAssistant = m.role === 'assistant' && i === lastAssistantIdx;
              const showFollowups = isLastAssistant && m.text && !busy;
              const followups = showFollowups
                ? followupsForMessage(m.text, priorFollowupContext(msgs.length))
                : [];
              const showActions = m.role === 'assistant' && m.text && !busy;
              return (
              <div
                key={i}
                className={`assistant-msg ${m.role === 'user' ? 'assistant-msg-user' : ''}`}
              >
                <div className="muted" style={{ marginBottom: 4 }}>
                  {m.role === 'user' ? '你' : '小爱'}
                </div>
                {m.role === 'assistant' ? (
                  m.text ? (
                    <div className="assistant-answer">
                      <AnswerText text={m.text} />
                    </div>
                  ) : (
                    <div className="muted">…</div>
                  )
                ) : (
                  <div className="assistant-user-text">
                    {m.text || '…'}
                  </div>
                )}
                {m.citations && m.citations.length > 0 && (
                  <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
                    {m.citations.map((c) => `[${c.n}] ${c.title}`).join(' · ')}
                  </div>
                )}
                {showActions && (
                  <>
                    {showFollowups && followups.length > 0 && (
                      <div className="followup-row">
                        {followups.map((q) => (
                          <button
                            key={q}
                            type="button"
                            className="followup-chip"
                            disabled={busy}
                            onClick={() => send(q, 'explain')}
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
                          createNote(stripFollowups(m.text), ref || undefined, ['小爱']);
                          flashToast('已存笔记');
                        }}
                      >
                        存笔记
                      </button>
                      <button type="button" className="msg-action" onClick={() => shareText(m.text)}>
                        分享
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
            })}
          </div>
          {composer}
        </div>
      )}

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
              <div style={{ marginTop: 8 }}>
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="history-item"
                    onClick={() => openSession(s)}
                  >
                    <div className="history-item-top">
                      <span className="history-item-title">{s.title}</span>
                      <span className="muted" style={{ fontSize: 11 }}>{s.updated}</span>
                    </div>
                    {s.preview && <span className="muted history-item-preview">{s.preview}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
