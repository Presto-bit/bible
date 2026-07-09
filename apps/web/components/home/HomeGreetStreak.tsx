'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { readingStreak } from '@/lib/gamification';
import { todayMinutes } from '@/lib/reading';
import { subscribeLocalDataChanged } from '@/lib/local_data_events';
import { getSyncState, subscribeSyncState } from '@/lib/sync_status';

type Props = {
  greeting: string;
  userName: string;
};

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

  let streakLine: string;
  if (streak <= 0 && !readToday) {
    streakLine = '今天读一点，开启连续打卡';
  } else if (streak <= 0 && readToday) {
    streakLine = `今日已读 ${minutes} 分钟 · 明天继续就连续啦`;
  } else {
    streakLine = `已连续读经 ${streak} 天 · 今日 ${minutes} 分钟`;
  }

  return (
    <div className="home-greet-streak">
      <div className="greet-text">
        <span className="greet-prefix">{greeting}</span>
        <span className="greet-name">
          <i className="greet-bar" />
          {userName}
        </span>
      </div>
      <Link href="/report" className="home-greet-streak-line muted">
        {streakLine}
        <span className="home-list-chevron" aria-hidden>›</span>
      </Link>
    </div>
  );
}
