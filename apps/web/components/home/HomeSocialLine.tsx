'use client';

import Link from 'next/link';
import type { HomeSocialLine } from '@/lib/home_social_line';

type Props = {
  line: HomeSocialLine | null;
  loading?: boolean;
};

export function HomeSocialLine({ line, loading }: Props) {
  if (loading) {
    return (
      <div className="card row-card home-social-line home-social-line-loading">
        <span className="muted">加载社交动态…</span>
      </div>
    );
  }
  if (!line) return null;

  return (
    <Link href={line.href} className="card row-card home-social-line home-list-row">
      <span className="pill pill-active">共读</span>
      <span className="home-list-main">{line.text}</span>
      <span className="muted home-list-chevron">›</span>
    </Link>
  );
}
