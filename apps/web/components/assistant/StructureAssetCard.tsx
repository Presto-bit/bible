'use client';

import Link from 'next/link';
import TimelineRail from '@/components/assistant/TimelineRail';
import type { StructureAsset } from '@/lib/assistant_blocks';

type Props = {
  asset: StructureAsset;
};

export default function StructureAssetCard({ asset }: Props) {
  const nodes = asset.nodes ?? [];
  const kindLabel =
    asset.kind === 'diagram' ? '示意图' : asset.kind === 'graph' ? '结构图' : '年表';

  return (
    <aside className="structure-asset-card" aria-label={`结构参考：${asset.label}`}>
      <div className="structure-asset-head">
        <span className="structure-asset-kind">{kindLabel}</span>
        <strong className="structure-asset-title">{asset.label}</strong>
        {asset.subtitle ? (
          <p className="structure-asset-sub muted">{asset.subtitle}</p>
        ) : null}
      </div>
      {nodes.length > 0 ? (
        <TimelineRail nodes={nodes} preset />
      ) : null}
      {asset.href ? (
        <Link href={asset.href} className="structure-asset-link text-link">
          查看完整{kindLabel} ›
        </Link>
      ) : null}
    </aside>
  );
}
