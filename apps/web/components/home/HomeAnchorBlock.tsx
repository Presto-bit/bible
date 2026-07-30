'use client';

import type { HomeAnchorBlockModel } from '@/lib/home_anchor_block';

type Props = {
  block: HomeAnchorBlockModel;
  onGo: (href: string) => void;
};

/** 稳定落点：小组 / 同行 / 发现，非成长资产。 */
export function HomeAnchorBlock({ block, onGo }: Props) {
  return (
    <button
      type="button"
      className="card row-card home-list-row home-growth-row-single home-anchor-block"
      aria-label={`${block.tag}：${block.title}`}
      onClick={() => onGo(block.href)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className={`pill${block.pillActive ? ' pill-active' : ''}`}>{block.tag}</span>
      <span className="home-list-main">
        <strong>{block.title}</strong>
      </span>
      <span className="muted home-list-chevron">›</span>
    </button>
  );
}
