'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadDailyThemes, type DailyThemesIndex } from '@/lib/daily_themes';

export function ThemeExploreRail() {
  const [index, setIndex] = useState<DailyThemesIndex | null>(null);

  useEffect(() => {
    void loadDailyThemes().then(setIndex);
  }, []);

  const themes = index?.themes ?? [];
  if (!themes.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="section-row">
        <span>经文主题</span>
        <Link href="/discover" className="muted">发现更多 ›</Link>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
        {index?.count ? `${index.count} 条每日经文 · ` : ''}
        {themes.length} 个主题分类
      </p>
      <div className="rail theme-explore-rail" style={{ marginTop: 8 }}>
        {themes.map((t) => (
          <Link
            key={t}
            href={`/discover/topic/${encodeURIComponent(t)}`}
            className="rail-card card card-2 theme-chip-card"
          >
            {t}
          </Link>
        ))}
      </div>
    </div>
  );
}
