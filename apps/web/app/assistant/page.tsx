'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { chatStream, type Citation } from '@/lib/api';
import AnswerText from '@/components/AnswerText';

// 输入框上方的可右滑 chip 行（意图 + 场景 + 译本/原文）。
const CHIPS: { label: string; mode: string; q: string }[] = [
  { label: '经文背景', mode: 'explain', q: '请介绍这段经文的背景' },
  { label: '解释经文', mode: 'explain', q: '请解释这段经文' },
  { label: '应用', mode: 'apply', q: '请把这段经文应用到生活' },
  { label: '预备查经', mode: 'understand', q: '请帮我预备查经' },
  { label: '预备讲道', mode: 'understand', q: '请帮我预备讲道' },
  { label: '译本对照', mode: 'compare', q: '请对照不同译本解释这节' },
  { label: '原文释义', mode: 'original', q: '请从原文角度解释这节' },
];

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

// 从回答末尾解析【相关追问】列表，供渲染可点击的追问 chip。
function followupsOf(text: string): string[] {
  const idx = text.search(/[【\[]?\s*相关追问\s*[】\]]?[:：]?/);
  if (idx < 0) return [];
  const tail = text.slice(idx);
  const lines = tail.split('\n').slice(1);
  const out: string[] = [];
  for (const raw of lines) {
    const m = raw.match(/^\s*(?:[-*•]|\d+[.)、])\s*(.+?)\s*$/);
    if (m && m[1]) out.push(m[1].replace(/^["“]|["”]$/g, '').trim());
  }
  return out.slice(0, 3);
}

// 复制/分享时去掉末尾的相关追问段落，只保留正文。
function stripFollowups(text: string): string {
  const idx = text.search(/\n?\s*[【\[]?\s*相关追问\s*[】\]]?[:：]?/);
  return idx >= 0 ? text.slice(0, idx).trim() : text.trim();
}

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
  const [mode, setMode] = useState('understand');
  const [ref, setRef] = useState('');
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>('current');
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seedBoot = useRef(false);
  const rafRef = useRef<number | null>(null);

  const [toast, setToast] = useState('');
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
    if (quotaExhausted) return;
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
    const r = new URLSearchParams(window.location.search).get('ref');
    if (r) setRef(r);
    setSessions(loadSessions());
  }, []);

  const persist = (nextMsgs: Msg[], anchor: string) => {
    const title = nextMsgs.find((m) => m.role === 'user')?.text.slice(0, 18) || anchor || '新会话';
    const preview = nextMsgs[nextMsgs.length - 1]?.text.slice(0, 40) || '';
    setSessions((prev) => {
      const rest = prev.filter((s) => s.id !== activeId);
      const next: Session = {
        id: activeId,
        title,
        ref: anchor,
        preview,
        updated: '今天',
        msgs: nextMsgs,
      };
      const list = [next, ...rest];
      saveSessions(list);
      return list;
    });
  };

  const quotaExhausted =
    quota != null && quota.limit > 0 && quota.used >= quota.limit;
  const quotaLow =
    quota != null &&
    quota.limit > 0 &&
    !quotaExhausted &&
    quota.used >= quota.limit - 2;

  const send = async (question?: string, nextMode?: string, refOverride?: string) => {
    const q = (question ?? input).trim();
    if (!q || busy || quotaExhausted) return;
    const m = nextMode ?? mode;
    const anchor = (refOverride ?? ref).trim() || null;
    setMode(m);
    setInput('');
    const base: Msg[] = [...msgs, { role: 'user', text: q }, { role: 'assistant', text: '' }];
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
          if (meta.quota) setQuota(meta.quota);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('ref');
    const seedQ = params.get('q');
    if (r && seedQ && !seedBoot.current) {
      seedBoot.current = true;
      void sendRef.current(decodeURIComponent(seedQ), 'understand', r);
    }
  }, []);

  const startNewSession = () => {
    setActiveId(`s-${Date.now()}`);
    setMsgs([]);
    setInput('');
    setHistoryOpen(false);
  };

  const openSession = (s: Session) => {
    setActiveId(s.id);
    setMsgs(s.msgs);
    setRef(s.ref);
    setHistoryOpen(false);
  };

  const composer = (
    <div className="assistant-composer">
      <div className="chip-swipe">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            className="chip-swipe-item"
            disabled={quotaExhausted || busy}
            onClick={() => send(c.q, c.mode)}
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
              disabled={quotaExhausted}
              onPointerDown={startVoice}
              onPointerMove={onVoiceMove}
              onPointerUp={endVoice}
              onPointerCancel={endVoice}
            >
              {recording ? (cancelArmed ? '松开取消' : '松开发送 · 上滑取消') : '按住 说话'}
            </button>
          ) : (
            <input
              className="compose-input"
              placeholder={quotaExhausted ? '今日次数已用完' : ref ? `关于 ${ref}，问小爱…` : '问小爱…'}
              value={input}
              disabled={quotaExhausted}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
            />
          )}
          <button
            type="button"
            className="compose-mode-inner"
            aria-label={voiceMode ? '切换键盘' : '切换语音'}
            disabled={quotaExhausted}
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
        {ref ? (
          <Link href="/reader" className="rail-cta">
            {ref} ›
          </Link>
        ) : (
          <span />
        )}
      </header>

      {quota && (
        <p className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
          今日 {quota.used}/{quota.limit}
        </p>
      )}
      {quotaLow && (
        <p style={{ color: '#b8860b', fontSize: 12, marginBottom: 6 }}>
          今日 AI 次数即将用完
        </p>
      )}
      {quotaExhausted && (
        <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          今日 AI 次数已用完，明日恢复；仍可使用注释指南与阅读。
        </p>
      )}

      {msgs.length === 0 ? (
        <div className="assistant-empty-fill">
          <div className="assistant-empty-hint">
            <p className="muted">带着经节锚点，继续深问</p>
            <p className="rail-cta">
              {ref ? `已预读 ${ref}，点下面即秒回` : '输入锚定经文后可秒回'}
            </p>
            <div className="empty-pills">
              <button
                type="button"
                className="font-pill"
                disabled={quotaExhausted}
                onClick={() => send('请介绍今天这段经文的背景', 'explain')}
              >
                问今天这段经文的背景
              </button>
              <button
                type="button"
                className="font-pill"
                disabled={quotaExhausted}
                onClick={() => send('这节里的「永生」是什么意思？', 'explain')}
              >
                永生是什么意思？
              </button>
            </div>
          </div>
          {composer}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="assistant-thread">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`assistant-msg ${m.role === 'user' ? 'assistant-msg-user' : ''}`}
              >
                <div className="muted" style={{ marginBottom: 4 }}>
                  {m.role === 'user' ? '你' : '小爱'}
                </div>
                {m.role === 'assistant' ? (
                  m.text ? (
                    <AnswerText text={m.text} />
                  ) : (
                    <div className="muted">…</div>
                  )
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {m.text || '…'}
                  </div>
                )}
                {m.citations && m.citations.length > 0 && (
                  <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
                    {m.citations.map((c) => `[${c.n}] ${c.title}`).join(' · ')}
                  </div>
                )}
                {m.role === 'assistant' && m.text && !busy && (
                  <>
                    {followupsOf(m.text).length > 0 && (
                      <div className="followup-row">
                        {followupsOf(m.text).map((q, qi) => (
                          <button
                            key={qi}
                            type="button"
                            className="followup-chip"
                            disabled={quotaExhausted}
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
                      <button type="button" className="msg-action" onClick={() => shareText(m.text)}>
                        分享
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          {composer}
        </>
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
