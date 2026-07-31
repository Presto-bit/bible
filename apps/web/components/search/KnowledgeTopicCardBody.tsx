'use client';

import type { ReactNode } from 'react';

/** 知识专题列表 / 轨卡正文：hook 主行 + 计量次行 + 分化 CTA */
export function KnowledgeTopicCardBody({
  badge,
  badgeClassName,
  title,
  hook,
  meta,
  progress,
  cta,
}: {
  badge: string;
  badgeClassName?: string;
  title: string;
  hook?: string | null;
  meta?: string | null;
  progress?: string | null;
  cta: string;
}): ReactNode {
  return (
    <>
      <span className={['story-tour-badge', badgeClassName].filter(Boolean).join(' ')}>
        {badge}
      </span>
      <strong className="story-tour-title">{title}</strong>
      {hook ? <p className="story-tour-hook">{hook}</p> : null}
      {meta ? <p className="muted story-tour-meta">{meta}</p> : null}
      {progress ? <p className="muted story-tour-progress">{progress}</p> : null}
      <span className="story-tour-toggle">{cta}</span>
    </>
  );
}
