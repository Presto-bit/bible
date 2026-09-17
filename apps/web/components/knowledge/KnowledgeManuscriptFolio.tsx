'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clientWithBasePath } from '@/lib/basePath';

export type ManuscriptFolioPage = {
  key: string;
  src: string;
  alt: string;
};

type Props = {
  pages: ManuscriptFolioPage[];
  onIndexChange?: (index: number) => void;
};

/**
 * §19.14.17 手稿册：左右横滑翻页；首尾不可再滑（不循环）。
 * 不做站序号条；极简圆点仅作页指示。
 */
export function KnowledgeManuscriptFolio({ pages, onIndexChange }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const total = pages.length;

  useEffect(() => {
    setIndex(0);
    scrollerRef.current?.scrollTo({ left: 0 });
  }, [pages]);

  const syncIndex = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !el.clientWidth) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    const clamped = Math.max(0, Math.min(total - 1, next));
    setIndex(clamped);
    onIndexChange?.(clamped);
  }, [onIndexChange, total]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => syncIndex();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [syncIndex]);

  if (!pages.length) {
    return (
      <section className="knowledge-folio" aria-label="彼爱手稿">
        <p className="muted knowledge-dense-loading">手稿暂不可用</p>
      </section>
    );
  }

  return (
    <section className="knowledge-folio" aria-label="彼爱手稿">
      <div
        ref={scrollerRef}
        className="knowledge-folio-scroller"
        role="region"
        aria-roledescription="手稿册"
        aria-label={`共 ${total} 页，左右滑动翻页`}
      >
        {pages.map((p, i) => (
          <div key={p.key} className="knowledge-folio-page" aria-hidden={i !== index}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="knowledge-folio-img"
              src={clientWithBasePath(p.src)}
              alt={p.alt}
              draggable={false}
              onLoad={() => setReady((m) => ({ ...m, [p.key]: true }))}
              onError={() => setReady((m) => ({ ...m, [p.key]: false }))}
            />
            {ready[p.key] === false ? (
              <p className="muted knowledge-folio-missing">本页手稿暂缺</p>
            ) : null}
          </div>
        ))}
      </div>
      {total > 1 ? (
        <div className="knowledge-folio-dots" aria-hidden>
          {pages.map((p, i) => (
            <span key={p.key} className={i === index ? 'is-on' : undefined} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** 总手稿 + 站手稿路径（烘焙 PNG） */
export function manuscriptFolioPages(opts: {
  tourId: string;
  title: string;
  beatOrders: number[];
}): ManuscriptFolioPage[] {
  const { tourId, title, beatOrders } = opts;
  const pages: ManuscriptFolioPage[] = [
    {
      key: 'overview',
      src: `/knowledge/infographics/${encodeURIComponent(tourId)}-comic.png`,
      alt: `${title} · 总手稿`,
    },
  ];
  for (const order of beatOrders) {
    const n = String(order).padStart(2, '0');
    pages.push({
      key: `s${n}`,
      src: `/knowledge/infographics/${encodeURIComponent(tourId)}-s${n}.png`,
      alt: `${title} · 第 ${order} 站手稿`,
    });
  }
  return pages;
}
