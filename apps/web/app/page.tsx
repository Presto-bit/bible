'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  api,
  type DailyVerse,
} from '@/lib/api';
import { currentSeasonalEvents } from '@/lib/gamification';
import { challengeSummary, getPendingBookChallenge, levelsIncludingPending } from '@/lib/challenge_progress';
import { getActivePlan, getPlanDay } from '@/lib/plan_progress';
import { buildPlanReadingMeta, readerHref, resumeStepIndex } from '@/lib/plan_reading';
import { getPlanSession } from '@/lib/plan_session';
import { sessionProgress } from '@/lib/plan_steps';
import PlusMenu from '@/components/PlusMenu';

// 每日经文全屏背景图（按主题挑选；可在此配置更多背景）。
const VERSE_BG =
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80';

function buildRail(
  challengeTitle: string,
  challengeSub: string,
  plan?: { title: string; sub: string; href: string },
) {
  return [
    {
      tag: '计划',
      reason: '今日计划',
      title: plan?.title ?? '开始读经计划',
      sub: plan?.sub ?? '热门计划 · 个性定制',
      cta: plan ? '去读 ›' : '去看看 ›',
      href: plan?.href ?? '/plans',
      accent: true,
    },
    {
      tag: '挑战',
      reason: '知识闯关',
      title: challengeTitle,
      sub: challengeSub,
      cta: '闯关 ›',
      href: '/challenge',
      accent: false,
    },
    {
      tag: '继续',
      reason: '你上次读到这里',
      title: '约翰福音 3',
      sub: '从上次继续 · 约 3 分钟',
      cta: '读 ›',
      href: '/reader',
    },
    {
      tag: '小爱',
      reason: '基于今日经文',
      title: '小爱想问你',
      sub: '「这段经文里，神的应许对你意味着什么？」',
      cta: '聊聊 ›',
      href: '/assistant',
    },
  ];
}

export default function HomePage() {
  const [dv, setDv] = useState<DailyVerse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [shared, setShared] = useState(false);
  const [page, setPage] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);

  const [verseFull, setVerseFull] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [pendingBook, setPendingBook] = useState<ReturnType<typeof getPendingBookChallenge>>(null);
  const [rail, setRail] = useState(() => buildRail('第 1 关 · 福音核心', '开始闯关'));
  const seasonal = currentSeasonalEvents();

  const refreshRail = useCallback(async () => {
    setPendingBook(getPendingBookChallenge());
    const sum = challengeSummary(levelsIncludingPending());
    let planCard: { title: string; sub: string; href: string } | undefined;
    const active = getActivePlan();
    if (active && active.kind !== 'prayer') {
      const day = getPlanDay(active.planId) || 1;
      const meta = await buildPlanReadingMeta(active, day);
      if (meta) {
        const sess = getPlanSession(active.planId, day) ?? meta.session;
        const fullMeta = { ...meta, session: sess };
        const idx = resumeStepIndex(fullMeta);
        const step = meta.steps[idx] ?? meta.steps[0];
        const p = sessionProgress(meta.steps, sess.stepsDone);
        planCard = {
          title: `${active.title} · 第 ${day} 天`,
          sub: `${step.label} · ${p.done}/${p.total} 段`,
          href: readerHref(fullMeta, idx),
        };
      }
    }
    setRail(
      buildRail(
        sum.nextLevel
          ? `${sum.nextLevel.title} · ${sum.nextLevel.subtitle}`
          : '全部通关 · 复习巩固',
        `已掌握 ${sum.correctQ} / ${sum.totalQ} 题`,
        planCard,
      ),
    );
  }, []);

  useEffect(() => {
    refreshRail();
  }, [refreshRail]);

  useEffect(() => {
    api
      .dailyVerse()
      .then(setDv)
      .catch((e) => setErr(String(e)));
  }, []);

  const onScroll = () => {
    const el = railRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / (el.clientWidth * 0.82));
    setPage(Math.max(0, Math.min(rail.length - 1, i)));
  };

  return (
    <main className="container">
      <header className="greet">
        <div className="greet-text">
          <span className="greet-prefix">早安</span>
          <span className="greet-name">
            <i className="greet-bar" />
            读经伙伴
          </span>
        </div>
        <div className="greet-actions">
          <a href="/search" aria-label="搜索" className="icon-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
          </a>
          <button
            ref={plusBtnRef}
            type="button"
            aria-label="添加"
            className="icon-btn icon-btn-fill"
            onClick={() => setPlusOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </header>

      {seasonal[0] && (
        <Link href={seasonal[0].href} className="card row-card seasonal-card" style={{ display: 'flex', marginBottom: 14 }}>
          <span className="pill pill-active">{seasonal[0].badge}</span>
          <span style={{ flex: 1 }}>
            <strong>{seasonal[0].title}</strong>
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>{seasonal[0].subtitle}</span>
          </span>
          <span className="muted">›</span>
        </Link>
      )}

      <div
        className="card card-3 card-tint hero-verse"
        role="button"
        tabIndex={0}
        onClick={() => setVerseFull(true)}
      >
        <div className="hero-scene" aria-hidden />
        <div className="hero-inner">
          <div className="hero-top">
            <span className="hero-kicker">每日经文</span>
            {dv?.theme ? <span className="muted">{dv.theme}系列</span> : null}
          </div>
          {dv?.ref ? <p className="hero-ref">{dv.ref}</p> : null}
          <p className="verse-text">
            {err
              ? '内容加载失败，请稍后重试。'
              : dv
                ? `「${dv.text}」`
                : '加载中…'}
          </p>
          <div className="hero-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="hero-like"
              onClick={() => setLiked((v) => !v)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" style={{ color: liked ? 'var(--accent-deep)' : 'var(--ink-faint)' }}>
                <path d="M12 21s-7-4.6-9.3-8.4C1 9.6 2.5 6 6 6c2 0 3.2 1.2 4 2.3C10.8 7.2 12 6 14 6c3.5 0 5 3.6 3.3 6.6C19 16.4 12 21 12 21z" />
              </svg>
              <span>{(3842 + (liked ? 1 : 0)).toLocaleString()} 人点赞</span>
            </button>
            <button
              type="button"
              className={`hero-share ${shared ? 'hero-share-active' : ''}`}
              onClick={() => setShared((v) => !v)}
            >
              {shared ? '已生成图 ✓' : '分享 / 壁纸'}
            </button>
          </div>
        </div>
      </div>

      <div className="rail home-rail" ref={railRef} onScroll={onScroll} style={{ marginTop: 18 }}>
        {rail.map((c, i) => (
          <a
            key={i}
            href={c.href}
            className={`rail-card card card-2 ${c.accent ? 'card-tint card-accent' : ''}`}
          >
            <div className="rail-head">
              <span className={`pill ${c.accent ? 'pill-active' : ''}`}>{c.tag}</span>
              <span className="muted rail-reason">{c.reason}</span>
            </div>
            <div className="rail-title">{c.title}</div>
            <div className="rail-foot">
              <span className="rail-sub">{c.sub}</span>
              <span className="rail-cta">{c.cta}</span>
            </div>
          </a>
        ))}
      </div>
      <div className="dots">
        {rail.map((_, i) => (
          <span key={i} className={i === page ? 'dot dot-active' : 'dot'} />
        ))}
      </div>

      <a href="/profile" className="card row-card" style={{ display: 'flex' }}>
        <span>今日 12 分钟 · 本月已读 9 天</span>
        <span className="muted">›</span>
      </a>

      <a href="/discover" className="card row-card" style={{ display: 'flex', marginTop: 14 }}>
        <span className="pill">小组</span>
        <span style={{ flex: 1 }}>新约共读群 · 今日 6 人已打卡</span>
        <span className="muted">去发现 ›</span>
      </a>

      <p className="section-label">成长与回忆</p>
      {pendingBook && (
        <Link href="/challenge" className="card card-2 card-tint row-card challenge-nudge" style={{ display: 'flex', marginBottom: 10 }}>
          <span className="pill pill-active">巩固挑战</span>
          <span style={{ flex: 1, fontWeight: 600 }}>读完《{pendingBook.bookName}》了，来一关知识挑战？</span>
          <span className="rail-cta">去闯关 ›</span>
        </Link>
      )}
      <a href="/reader" className="card card-2 card-tint card-accent row-card" style={{ display: 'flex' }}>
        <span className="pill pill-active">就快读完</span>
        <span style={{ flex: 1, fontWeight: 600 }}>马可福音还剩 2 章就读完啦</span>
        <span className="rail-cta">读完它 ›</span>
      </a>
      <a href="/reader" className="card row-card" style={{ display: 'flex', marginTop: 10 }}>
        <span className="pill">去年今日</span>
        <span style={{ flex: 1 }}>去年今日你读了诗篇 23，还划了线</span>
        <span className="muted">看看 ›</span>
      </a>
      <a href="/profile" className="card row-card" style={{ display: 'flex', marginTop: 10 }}>
        <span className="pill">回顾</span>
        <span style={{ flex: 1 }}>6 月回顾 · 已读 9 天 · 标记 14 处</span>
        <span className="muted">生成回顾 ›</span>
      </a>

      {verseFull && (
        <div
          className="verse-full"
          style={{ backgroundImage: `url(${VERSE_BG})` }}
          onClick={() => setVerseFull(false)}
        >
          <div className="verse-full-scrim" />
          <div className="verse-full-glow" aria-hidden />
          <button type="button" className="verse-full-close" aria-label="关闭" onClick={() => setVerseFull(false)}>
            ✕
          </button>
          <div className="verse-full-inner" onClick={(e) => e.stopPropagation()}>
            <p className="verse-full-kicker">每日经文</p>
            <div className="verse-full-ornament" aria-hidden>✦</div>
            {dv?.ref && <p className="verse-full-ref">{dv.ref}</p>}
            <p className="verse-full-text">{dv ? dv.text : '加载中…'}</p>
            {dv?.theme && <p className="verse-full-theme">{dv.theme}</p>}
          </div>
        </div>
      )}

      <PlusMenu anchorRef={plusBtnRef} open={plusOpen} onClose={() => setPlusOpen(false)} />
    </main>
  );
}
