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
        stroke="rgba(15,23,42,0.12)"
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

export function RailCardVisual({ card }: Props) {
  const { layout } = card;

  if (layout === 'cover' && card.bookId) {
    const showRing = railShowsProgress(card) && (card.progressPct ?? 0) > 0;
    return (
      <div className={`rail-card-media rail-card-media-cover rail-card-media-${card.tint}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bookCoverImageUrl(card.bookId)}
          alt=""
          className="rail-card-cover-photo"
        />
        <div className="rail-card-cover-veil" aria-hidden />
        <p className="rail-card-cover-title">{bookCoverLabel(card.bookId)}</p>
        {showRing ? <ProgressRing pct={card.progressPct!} /> : null}
      </div>
    );
  }

  if (layout === 'stat' && card.statPct != null) {
    return (
      <div className={`rail-card-media rail-card-media-stat rail-card-media-${card.tint}`}>
        <span className="rail-card-stat-pct">{Math.round(card.statPct)}%</span>
        {card.statLabel ? (
          <span className="rail-card-stat-label">{card.statLabel}</span>
        ) : null}
      </div>
    );
  }

  if (layout === 'note') {
    return (
      <div className={`rail-card-media rail-card-media-note rail-card-media-${card.tint}`}>
        {card.sceneId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={railSceneUrl(card.sceneId)} alt="" className="rail-card-scene-bg" />
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
        {card.sceneId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={railSceneUrl(card.sceneId)} alt="" className="rail-card-scene-bg" />
        ) : null}
        <p className="rail-card-verse-ref">{card.title}</p>
      </div>
    );
  }

  if (card.sceneId) {
    return (
      <div className={`rail-card-media rail-card-media-scene rail-card-media-${card.tint}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={railSceneUrl(card.sceneId)} alt="" className="rail-card-scene-img" />
      </div>
    );
  }

  return null;
}
