'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  claimKnowledgeExpandForBoot,
  peekKnowledgeExpandOrigin,
  type KnowledgeExpandOrigin,
} from '@/lib/knowledge_nav';
import { knowledgeMediaUrl } from '@/lib/knowledge_media_url';

function styleVars(origin: KnowledgeExpandOrigin): CSSProperties {
  if (typeof window === 'undefined') return {};
  const vw = Math.max(window.innerWidth, 1);
  const vh = Math.max(window.innerHeight, 1);
  return {
    ['--kx' as string]: `${origin.x}px`,
    ['--ky' as string]: `${origin.y}px`,
    ['--ksx' as string]: String(origin.w / vw),
    ['--ksy' as string]: String(origin.h / vh),
    ['--kr' as string]: `${origin.radius || 16}px`,
  };
}

type Props = {
  /** 无 session 原点时的兜底封面 */
  fallbackCover?: string;
  label?: string;
};

/**
 * 专题 ?view=1 载入期：用卡片封面做放大过渡，避免黑屏「打开手稿…」。
 * claim 只生效一次，避免 Suspense → loading 双挂载吞掉动画。
 */
export function KnowledgeExpandBoot({
  fallbackCover,
  label = '打开手稿…',
}: Props) {
  const [origin] = useState<KnowledgeExpandOrigin | null>(() =>
    claimKnowledgeExpandForBoot(),
  );
  const [coverPath] = useState(
    () => origin?.cover || peekKnowledgeExpandOrigin()?.cover || fallbackCover || '',
  );
  const [ready, setReady] = useState(!origin);

  useEffect(() => {
    if (!origin) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReady(true);
      return;
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setReady(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, [origin]);

  return (
    <div
      className={[
        'knowledge-expand-boot',
        origin ? 'is-expand' : '',
        origin && !ready ? 'is-expand-from' : '',
        ready ? 'is-ready' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={origin ? styleVars(origin) : undefined}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {coverPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="knowledge-expand-boot-cover"
          src={knowledgeMediaUrl(coverPath)}
          alt=""
          decoding="async"
        />
      ) : (
        <span className="knowledge-expand-boot-fallback" />
      )}
      <p className="knowledge-expand-boot-label">{label}</p>
    </div>
  );
}
