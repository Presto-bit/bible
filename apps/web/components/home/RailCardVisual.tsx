'use client';

import { bookCoverImageUrl, bookCoverLabel } from '@/lib/book_cover';
import type { RailCard } from '@/lib/home_rail';
import { railShowsProgress } from '@/lib/home_rail';
import { railSceneUrl } from '@/lib/rail_scene';

type Props = {
  card: RailCard;
};

function ProgressRing({ pct }: { pct: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <svg className="rail-card-progress-ring" viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r={r} fill="rgba(255,255,255,0.72)" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="rgba(15, 23, 42, 0.12)"
        strokeWidth="3"
      />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="var(--accent-deep)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 20 20)"
      />
      <text
        x="20"
        y="20"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9"
        fontWeight="700"
        fill="var(--ink)"
      >
        {Math.round(pct)}
      </text>
    </svg>
  );
}

function SceneBackdrop({ sceneId }: { sceneId: NonNullable<RailCard['sceneId']> }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={railSceneUrl(sceneId)} alt="" className="rail-card-scene-img" />
  );
}

export function RailCardVisual({ card }: Props) {
  const { layout } = card;
  const isChallenge = card.coverVariant === 'challenge';

  if (layout === 'cover' && card.bookId) {
    const showRing = railShowsProgress(card) && (card.progressPct ?? 0) > 0;
    return (
      <div
        className={[
          'rail-card-media',
          'rail-card-media-cover',
          `rail-card-media-${card.tint}`,
          isChallenge ? 'rail-card-media-cover-challenge' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bookCoverImageUrl(card.bookId)}
          alt=""
          className="rail-card-cover-photo"
        />
        <div className="rail-card-cover-veil" aria-hidden />
        <p className="rail-card-cover-title">{bookCoverLabel(card.bookId)}</p>
        {isChallenge ? <span className="rail-card-cover-badge">问答</span> : null}
        {showRing ? <ProgressRing pct={card.progressPct!} /> : null}
      </div>
    );
  }

  if (layout === 'scene-caption' && card.sceneId) {
    const showRing = railShowsProgress(card) && (card.progressPct ?? 0) > 0;
    return (
      <div className={`rail-card-media rail-card-media-scene-caption rail-card-media-${card.tint}`}>
        <SceneBackdrop sceneId={card.sceneId} />
        <div className="rail-card-scene-veil" aria-hidden />
        {card.mediaCaption ? (
          <p className="rail-card-scene-caption">{card.mediaCaption}</p>
        ) : null}
        {showRing ? <ProgressRing pct={card.progressPct!} /> : null}
      </div>
    );
  }

  if (layout === 'stat' && card.statPct != null) {
    const ratioLabel = card.statLabel && /^\d+\/\d+$/.test(card.statLabel);
    return (
      <div className={`rail-card-media rail-card-media-stat rail-card-media-${card.tint}`}>
        {card.sceneId ? <SceneBackdrop sceneId={card.sceneId} /> : null}
        <div className="rail-card-stat-veil" aria-hidden />
        <div className="rail-card-stat-body">
          <span className="rail-card-stat-pct">
            {ratioLabel ? card.statLabel : `${Math.round(card.statPct)}%`}
          </span>
          <span className="rail-card-stat-label">
            {ratioLabel ? '今日打卡' : card.statLabel}
          </span>
        </div>
      </div>
    );
  }

  if (layout === 'note') {
    return (
      <div
        className={[
          'rail-card-media',
          'rail-card-media-note',
          `rail-card-media-${card.tint}`,
          card.noteExcerpt ? 'rail-card-media-note-filled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {!card.noteExcerpt && card.sceneId ? (
          <SceneBackdrop sceneId={card.sceneId} />
        ) : null}
        {card.noteExcerpt ? (
          <p className="rail-card-note-excerpt">&ldquo;{card.noteExcerpt}&rdquo;</p>
        ) : (
          <p className="rail-card-note-empty">记下读经时的想法</p>
        )}
      </div>
    );
  }

  if (layout === 'verse') {
    return (
      <div className={`rail-card-media rail-card-media-verse rail-card-media-${card.tint}`}>
        <div className="rail-card-verse-glow" aria-hidden />
        <p className="rail-card-verse-ref">{card.title}</p>
      </div>
    );
  }

  if (card.sceneId) {
    const isGroup = card.id === 'group';
    return (
      <div
        className={[
          'rail-card-media',
          'rail-card-media-scene',
          `rail-card-media-${card.tint}`,
          isGroup ? 'rail-card-media-group' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <SceneBackdrop sceneId={card.sceneId} />
        {isGroup ? (
          <>
            <div className="rail-card-group-glow" aria-hidden />
            <div className="rail-card-group-veil" aria-hidden />
          </>
        ) : null}
      </div>
    );
  }

  return null;
}
