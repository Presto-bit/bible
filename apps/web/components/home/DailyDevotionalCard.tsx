'use client';

import Link from 'next/link';
import type { DailyDevotional } from '@/lib/api';

export function DailyDevotionalCard({
  data,
  loading,
}: {
  data: DailyDevotional | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="card card-2 daily-devotional-card" style={{ marginTop: 14 }}>
        <p className="muted">加载每日灵修…</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="card card-2 card-tint daily-devotional-card" style={{ marginTop: 14 }}>
      <div className="section-row" style={{ marginTop: 0 }}>
        <strong>每日灵修</strong>
        {data.verse?.theme ? (
          <span className="muted" style={{ fontSize: 12 }}>{data.verse.theme}</span>
        ) : null}
      </div>
      {data.verse?.ref && (
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{data.verse.ref}</p>
      )}
      <p className="text-body" style={{ marginTop: 8 }}>{data.meditation}</p>
      <p className="daily-devotional-prayer" style={{ lineHeight: 1.65, marginTop: 10 }}>
        {data.prayer}
      </p>
      <div className="share-actions" style={{ marginTop: 12 }}>
        {data.verse?.ref && (
          <Link
            className="font-pill"
            href={`/assistant?ref=${encodeURIComponent(data.verse.ref)}`}
          >
            问小爱
          </Link>
        )}
      </div>
    </div>
  );
}
