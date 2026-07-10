'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { readingStreak } from '@/lib/gamification';
import { todayMinutes } from '@/lib/reading';
import { subscribeLocalDataChanged } from '@/lib/local_data_events';
import { getSyncState, subscribeSyncState } from '@/lib/sync_status';

const NAME_MAX_LEN = 6;

type Props = {
  greeting: string;
  userName: string;
};

function truncateDisplayName(name: string, maxLen = NAME_MAX_LEN): string {
  const trimmed = name.trim() || '读经伙伴';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

function shortReadingLabel(streak: number, minutes: number, readToday: boolean): string {
  if (streak <= 0 && !readToday) return '今日未读';
  if (streak <= 0 && readToday) return `今日${minutes}分`;
  if (minutes > 0) return `连续${streak}天·${minutes}分`;
  return `连续${streak}天`;
}

export function HomeGreetStreak({ greeting, userName }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const unsubSync = subscribeSyncState(() => {
      if (getSyncState() === 'synced') bump();
    });
    const unsubData = subscribeLocalDataChanged(bump);
    return () => {
      unsubSync();
      unsubData();
    };
  }, []);

  const { streak, minutes } = useMemo(
    () => ({ streak: readingStreak(), minutes: todayMinutes() }),
    [tick],
  );
  const readToday = minutes > 0;
  const fullName = userName.trim() || '读经伙伴';
  const displayName = truncateDisplayName(fullName);
  const readingLabel = shortReadingLabel(streak, minutes, readToday);

  return (
    <div className="home-greet-streak">
      <span className="home-greet-name" title={fullName}>
        {displayName}
      </span>
      <span className="home-greet-time">{greeting}</span>
      <Link href="/report" className="home-greet-stats" aria-label={`读经回顾：${readingLabel}`}>
        {readingLabel}
        <span className="home-greet-stats-chevron" aria-hidden>›</span>
      </Link>
    </div>
  );
}
