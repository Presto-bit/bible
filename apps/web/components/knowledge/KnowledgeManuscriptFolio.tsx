'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { knowledgeRasterSources } from '@/lib/knowledge_media_url';

export type ManuscriptFolioPage = {
  key: string;
  src?: string;
  alt: string;
  /** 文本叶：无烘焙 PNG 时的纸页正文 */
  text?: {
    title?: string;
    body: string;
  };
  /** 可选页内介质；无则纯图文手稿 */
  media?: {
    type: 'audio' | 'video';
    url: string;
    label?: string;
  };
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
            {p.text ? (
              <div className="knowledge-folio-text-leaf">
                {p.text.title ? <h3>{p.text.title}</h3> : null}
                <p>{p.text.body}</p>
              </div>
            ) : p.src ? (
              <>
                {(() => {
                  const { webp, fallback } = knowledgeRasterSources(p.src);
                  return (
                    <picture>
                      {webp ? <source type="image/webp" srcSet={webp} /> : null}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="knowledge-folio-img"
                        src={fallback}
                        alt={p.alt}
                        draggable={false}
                        onLoad={() => setReady((m) => ({ ...m, [p.key]: true }))}
                        onError={() => setReady((m) => ({ ...m, [p.key]: false }))}
                      />
                    </picture>
                  );
                })()}
                {ready[p.key] === false ? (
                  <p className="muted knowledge-folio-missing">本页手稿暂缺</p>
                ) : null}
              </>
            ) : (
              <p className="muted knowledge-folio-missing">本页手稿暂缺</p>
            )}
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

type FolioPageRaw = {
  key?: string;
  type?: string;
  src?: string;
  title?: string;
  body?: string;
  alt?: string;
  media?: ManuscriptFolioPage['media'];
};

/** 运营笔记 / 带 folio_pages 的 layout → 手稿页 */
export function manuscriptPagesFromLayout(layout: {
  id?: string;
  title?: string;
  cover_image?: string;
  folio_pages?: FolioPageRaw[];
  beats?: Array<{
    order?: number;
    label?: string;
    note?: string;
    happen?: string;
    vignette?: string;
    media?: ManuscriptFolioPage['media'];
  }>;
}): ManuscriptFolioPage[] {
  const title = layout.title || layout.id || '彼爱手稿';
  const raw = layout.folio_pages;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((p, i) => {
      const key = p.key || `p${i}`;
      if ((p.type === 'text' || p.body) && !p.src) {
        return {
          key,
          alt: p.alt || `${title} · ${p.title || `第 ${i + 1} 叶`}`,
          text: {
            title: p.title,
            body: (p.body || '').trim(),
          },
          media: p.media,
        };
      }
      return {
        key,
        src: p.src || layout.cover_image || '/knowledge/infographics/_paper_texture.jpg',
        alt: p.alt || `${title} · 第 ${i + 1} 叶`,
        media: p.media,
      };
    });
  }

  const cover = layout.cover_image || '/knowledge/infographics/_paper_texture.jpg';
  const pages: ManuscriptFolioPage[] = [
    { key: 'cover', src: cover, alt: `${title} · 封面` },
  ];
  for (const b of layout.beats || []) {
    const order = b.order ?? pages.length;
    if (b.vignette) {
      pages.push({
        key: `v${order}`,
        src: b.vignette,
        alt: `${title} · ${b.label || `第 ${order} 叶`}`,
        media: b.media,
      });
      continue;
    }
    const body = (b.note || b.happen || '').trim();
    if (!body) continue;
    pages.push({
      key: `t${order}`,
      alt: `${title} · ${b.label || `第 ${order} 叶`}`,
      text: { title: b.label, body },
      media: b.media,
    });
  }
  return pages;
}
