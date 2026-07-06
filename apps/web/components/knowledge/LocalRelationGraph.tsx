'use client';

import type { EntityGraph, EntityGraphNode, EntityRelation } from '@/lib/api';

const TYPE_COLOR: Record<string, string> = {
  person: '#3d6b8e',
  place: '#6b8a3d',
  term: '#8a6b3d',
  event: '#8a3d6b',
  unknown: '#8a7d6b',
};

export function LocalRelationGraph({
  graph,
  onNodeClick,
}: {
  graph: EntityGraph;
  onNodeClick?: (nodeId: string) => void;
}) {
  const center = graph.center;
  if (!center) {
    return <p className="muted" style={{ fontSize: 13 }}>暂无关系数据</p>;
  }
  const centerId = center.id ?? center.name;
  const neighbors = graph.edges.slice(0, 12);
  const w = 320;
  const h = 220;
  const cx = w / 2;
  const cy = h / 2;
  const r = 72;

  const nodes: { node: EntityGraphNode; edge?: EntityRelation }[] = neighbors.map((edge, i) => {
    const peerId = edge.peer_id ?? (edge.from === centerId ? edge.to : edge.from);
    const found = graph.nodes.find((n) => n.id === peerId);
    return {
      node: found ?? { id: peerId, name: edge.peer_name ?? peerId, type: 'unknown' },
      edge,
    };
  });

  return (
    <div className="local-relation-graph">
      <svg viewBox={`0 0 ${w} ${h}`} className="local-relation-graph-svg" role="img" aria-label="关系图">
        <circle cx={cx} cy={cy} r={r + 24} fill="none" stroke="var(--line, #e0d8cc)" strokeWidth="1" />
        {nodes.map(({ node, edge }, i) => {
          const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          const color = TYPE_COLOR[node.type] ?? TYPE_COLOR.unknown;
          return (
            <g key={`${node.id}-${i}`}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line, #d8d0c4)" strokeWidth="1" />
              {edge?.label ? (
                <text
                  x={(cx + x) / 2}
                  y={(cy + y) / 2 - 4}
                  textAnchor="middle"
                  fontSize="8"
                  fill="var(--ink-muted, #8a7d6b)"
                >
                  {edge.label.length > 8 ? `${edge.label.slice(0, 8)}…` : edge.label}
                </text>
              ) : null}
              <circle
                cx={x}
                cy={y}
                r={14}
                fill={color}
                opacity={0.9}
                style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
                onClick={() => onNodeClick?.(node.id)}
              />
              <text
                x={x}
                y={y + 22}
                textAnchor="middle"
                fontSize="9"
                fill="var(--ink, #3d3830)"
                style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
                onClick={() => onNodeClick?.(node.id)}
              >
                {node.name.length > 6 ? `${node.name.slice(0, 6)}…` : node.name}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={18} fill="var(--accent, #3d6b8e)" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fill="#fff" fontWeight="600">
          {(center.name ?? '').length > 5 ? `${center.name.slice(0, 5)}…` : center.name}
        </text>
      </svg>
    </div>
  );
}
