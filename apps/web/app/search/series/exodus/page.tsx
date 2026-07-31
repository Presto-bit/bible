'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import {
  EXODUS_STORY,
  exodusPlayHref,
} from '@/lib/exodus_series';
import {
  getStoryAlbumProgress,
  resumeStoryAlbum,
} from '@/lib/story_album_progress';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

export default function ExodusSeriesCoverPage() {
  const router = useRouter();
  const series = EXODUS_STORY;
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(() => getStoryAlbumProgress(series.id));

  useEffect(() => {
    setProgress(getStoryAlbumProgress(series.id));
    setReady(true);
  }, [series.id]);

  const resume = useMemo(
    () => resumeStoryAlbum(series.id, series.episodes.length),
    [series.id, series.episodes.length, progress],
  );

  const hasProgress = Boolean(
    progress && !progress.seriesDone && (progress.episodeIndex > 0 || progress.beatIndex > 0),
  );

  const ctaLabel = progress?.seriesDone
    ? '再看一遍'
    : hasProgress
      ? `继续 · 第 ${resume.episodeIndex + 1} 幕`
      : '开始故事';

  const start = () => {
    markRouteNavigation();
    if (progress?.seriesDone) {
      router.push(exodusPlayHref(0, 0));
      return;
    }
    router.push(exodusPlayHref(resume.episodeIndex, resume.beatIndex));
  };

  return (
    <main className="container story-album-cover-page">
      <header className="page-head">
        <PageBackBar href="/search" label="搜索" onClick={() => markRouteNavigation()} />
      </header>

      <section className="story-album-hero">
        <p className="story-album-hero-badge">旗舰系列</p>
        <h1 className="story-album-hero-title">{series.title}</h1>
        <p className="story-album-hero-hook">{series.hook}</p>
        <p className="muted story-album-hero-meta">
          约 {series.minutes} 分钟 · {series.disclaimer}
        </p>
        <button type="button" className="font-pill accent story-album-hero-cta" onClick={start}>
          {ready ? ctaLabel : '开始故事'}
        </button>
      </section>

      <section className="story-album-chapters">
        <h2 className="story-album-chapters-title">三幕</h2>
        <ol className="story-album-chapter-list">
          {series.episodes.map((ep, idx) => {
            const done = Boolean(progress?.episodeDone?.[ep.id]);
            const current = hasProgress && resume.episodeIndex === idx && !progress?.seriesDone;
            return (
              <li key={ep.id}>
                <Link
                  href={exodusPlayHref(idx, current ? resume.beatIndex : 0)}
                  className={`story-album-chapter-card${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}
                  onClick={() => markRouteNavigation()}
                >
                  <span className="story-album-chapter-idx">第 {idx + 1} 幕</span>
                  <strong className="story-album-chapter-name">{ep.title}</strong>
                  <p className="story-album-chapter-hook">{ep.hook}</p>
                  <span className="story-album-chapter-status">
                    {done ? '已完成' : current ? '继续 ›' : '开始 ›'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
