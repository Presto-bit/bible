'use client';

import type { HomeAnchorBlockModel } from '@/lib/home_anchor_block';
import { HomeMediaRow } from '@/components/home/HomeMediaRow';

type Props = {
  block: HomeAnchorBlockModel;
  onGo: (href: string) => void;
};

/** 稳定落点：小组 / 同行 / 发现，非成长资产。 */
export function HomeAnchorBlock({ block, onGo }: Props) {
  return (
    <HomeMediaRow
      title={block.title}
      eyebrow={block.tag}
      tone={block.mediaTone}
      icon={block.icon}
      imageUrl={block.imageUrl}
      ariaLabel={`${block.tag}：${block.title}`}
      className="home-anchor-block"
      onClick={() => onGo(block.href)}
    />
  );
}
