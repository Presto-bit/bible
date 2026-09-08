'use client';

import type { TimelineNode } from '@/lib/assistant_blocks';

type Props = {
  nodes: TimelineNode[];
  /** 预置结构（年表/谱系） */
  preset?: boolean;
};

export default function TimelineRail({ nodes, preset = false }: Props) {
  if (!nodes.length) return null;
  return (
    <ol
      className={`timeline-rail${preset ? ' timeline-rail-preset' : ''}`}
      aria-label="时间线"
    >
      {nodes.map((node, i) => (
        <li key={`${node.year}-${i}`} className="timeline-rail-item">
          <span className="timeline-rail-dot" aria-hidden />
          <div className="timeline-rail-body">
            <strong className="timeline-rail-year">{node.year}</strong>
            {(node.label && node.label !== node.year) || node.note ? (
              <p className="timeline-rail-text">
                {node.label && node.label !== node.year ? node.label : node.note}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
