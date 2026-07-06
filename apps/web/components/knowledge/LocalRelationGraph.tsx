'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { EntityGraph, EntityGraphNode, EntityRelation } from '@/lib/api';
import { entityDictionaryHref } from '@/lib/entity_knowledge';
import { entityTypeLabel } from '@/lib/dictionary_match';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { refSpaceToOsis } from '@/lib/inline_ref';

const TYPE_COLOR: Record<string, string> = {
  person: '#3d6b8e',
  place: '#6b8a3d',
  term: '#8a6b3d',
  event: '#8a3d6b',
  unknown: '#8a7d6b',
};

type LayoutNode = {
  node: EntityGraphNode;
  edge?: EntityRelation;
  edgeIndex?: number;
  x: number;
  y: number;
  isCenter?: boolean;
};

type Selection =
  | { kind: 'center' }
  | { kind: 'node'; id: string }
  | { kind: 'edge'; index: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function LocalRelationGraph({
  graph,
  onNodeClick,
  onRefClick,
}: {
  graph: EntityGraph;
  onNodeClick?: (nodeId: string) => void;
  onRefClick?: (osis: string, label: string) => void;
}) {
  const center = graph.center;
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);

  const w = 400;
  const h = 280;
  const cx = w / 2;
  const cy = h / 2;
  const r = 88;

  const layout = useMemo(() => {
    if (!center) return { centerId: '', nodes: [] as LayoutNode[] };
    const centerId = center.id ?? center.name;
    const neighbors = graph.edges.slice(0, 12);
    const nodes: LayoutNode[] = [
      {
        node: {
          id: centerId,
          name: center.name,
          type: center.type ?? 'person',
        },
        x: cx,
        y: cy,
        isCenter: true,
      },
    ];
    neighbors.forEach((edge, i) => {
      const peerId = edge.peer_id ?? (edge.from === centerId ? edge.to : edge.from);
      const found = graph.nodes.find((n) => n.id === peerId);
      const angle = (2 * Math.PI * i) / Math.max(neighbors.length, 1) - Math.PI / 2;
      nodes.push({
        node: found ?? { id: peerId, name: edge.peer_name ?? peerId, type: 'unknown' },
        edge,
        edgeIndex: i,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      });
    });
    return { centerId, nodes };
  }, [center, graph.edges, graph.nodes, cx, cy, r]);

  const selectedEdge = selection?.kind === 'edge' ? graph.edges[selection.index] : null;
  const selectedNode = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === 'center' && center) {
      return layout.nodes.find((n) => n.isCenter)?.node ?? null;
    }
    if (selection.kind === 'node') {
      return layout.nodes.find((n) => n.node.id === selection.id)?.node ?? null;
    }
    return null;
  }, [selection, layout.nodes, center]);

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => clamp(Number((s + delta).toFixed(2)), 0.6, 2.4));
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.12 : 0.12;
    zoomBy(delta);
  }, [zoomBy]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, panX, panY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [panX, panY]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPanX(drag.panX + (e.clientX - drag.x));
    setPanY(drag.panY + (e.clientY - drag.y));
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const selectNode = useCallback((node: EntityGraphNode, isCenter: boolean) => {
    setSelection(isCenter ? { kind: 'center' } : { kind: 'node', id: node.id });
  }, []);

  const selectEdge = useCallback((index: number) => {
    setSelection({ kind: 'edge', index });
  }, []);

  if (!center) {
    return <p className="muted" style={{ fontSize: 13 }}>暂无关系数据</p>;
  }

  const neighborNodes = layout.nodes.filter((n) => !n.isCenter);

  return (
    <div className="local-relation-graph">
      <div className="local-relation-graph-toolbar">
        <span className="muted" style={{ fontSize: 11 }}>拖动画布 · 滚轮缩放 · 点节点/连线看详情</span>
        <div className="local-relation-graph-zoom">
          <button type="button" className="font-pill" aria-label="缩小" onClick={() => zoomBy(-0.2)}>−</button>
          <button type="button" className="font-pill" aria-label="重置" onClick={resetView}>1×</button>
          <button type="button" className="font-pill" aria-label="放大" onClick={() => zoomBy(0.2)}>+</button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="local-relation-graph-viewport"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="local-relation-graph-svg"
          role="img"
          aria-label="关系图"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <circle cx={cx} cy={cy} r={r + 28} fill="none" stroke="var(--line, #e0d8cc)" strokeWidth="1" />
          {neighborNodes.map(({ node, edge, edgeIndex, x, y }, i) => {
            const edgeSelected = selection?.kind === 'edge' && selection.index === edgeIndex;
            return (
              <g key={`${node.id}-${i}`}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke={edgeSelected ? 'var(--accent, #3d6b8e)' : 'var(--line, #d8d0c4)'}
                  strokeWidth={edgeSelected ? 2.5 : 1}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (edgeIndex !== undefined) selectEdge(edgeIndex);
                  }}
                />
                {edge?.label ? (
                  <text
                    x={(cx + x) / 2}
                    y={(cy + y) / 2 - 4}
                    textAnchor="middle"
                    fontSize="9"
                    fill={edgeSelected ? 'var(--accent, #3d6b8e)' : 'var(--ink-muted, #8a7d6b)'}
                    style={{ cursor: 'pointer', pointerEvents: 'all' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (edgeIndex !== undefined) selectEdge(edgeIndex);
                    }}
                  >
                    {edge.label.length > 10 ? `${edge.label.slice(0, 10)}…` : edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {layout.nodes.map(({ node, x, y, isCenter }, i) => {
            const color = TYPE_COLOR[node.type] ?? TYPE_COLOR.unknown;
            const nodeSelected =
              (selection?.kind === 'center' && isCenter)
              || (selection?.kind === 'node' && selection.id === node.id);
            const radius = isCenter ? 20 : 16;
            return (
              <g key={`node-${node.id}-${i}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={radius + (nodeSelected ? 3 : 0)}
                  fill={color}
                  opacity={nodeSelected ? 1 : 0.92}
                  stroke={nodeSelected ? '#fff' : 'transparent'}
                  strokeWidth={2}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectNode(node, Boolean(isCenter));
                  }}
                />
                <text
                  x={x}
                  y={y + (isCenter ? 4 : 3)}
                  textAnchor="middle"
                  fontSize={isCenter ? 10 : 9}
                  fill="#fff"
                  fontWeight={isCenter ? 700 : 600}
                  style={{ cursor: 'pointer', pointerEvents: 'none' }}
                >
                  {node.name.length > (isCenter ? 4 : 3) ? `${node.name.slice(0, isCenter ? 4 : 3)}` : node.name}
                </text>
                <text
                  x={x}
                  y={y + radius + 14}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--ink, #3d3830)"
                  style={{ cursor: 'pointer', pointerEvents: 'all' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectNode(node, Boolean(isCenter));
                  }}
                >
                  {node.name.length > 8 ? `${node.name.slice(0, 8)}…` : node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selection ? (
        <div className="local-relation-graph-detail card card-2">
          {selectedEdge ? (
            <>
              <strong>{selectedEdge.label}</strong>
              {selectedEdge.type ? (
                <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                  {selectedEdge.type}
                </span>
              ) : null}
              <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                {selectedEdge.peer_name ?? selectedEdge.to}
              </p>
              {(selectedEdge.refs ?? []).length > 0 ? (
                <div className="share-actions" style={{ marginTop: 8 }}>
                  {(selectedEdge.refs ?? []).slice(0, 6).map((ref) => (
                    <button
                      key={ref}
                      type="button"
                      className="font-pill"
                      onClick={() => onRefClick?.(
                        ref.includes('.') ? ref : refSpaceToOsis(ref),
                        formatGroupRefLabel(ref) ?? ref,
                      )}
                    >
                      {formatGroupRefLabel(ref) ?? ref}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>暂无经节依据</p>
              )}
            </>
          ) : selectedNode ? (
            <>
              <strong>{selectedNode.name}</strong>
              {entityTypeLabel(selectedNode.type) ? (
                <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                  {entityTypeLabel(selectedNode.type)}
                </span>
              ) : null}
              <div className="share-actions" style={{ marginTop: 10 }}>
                {onNodeClick ? (
                  <button
                    type="button"
                    className="font-pill"
                    onClick={() => onNodeClick(selectedNode.id)}
                  >
                    切换到此人物
                  </button>
                ) : null}
                <Link
                  href={entityDictionaryHref({ id: selectedNode.id, name: selectedNode.name, type: selectedNode.type, summary: '', refs: [] })}
                  className="font-pill"
                  style={{ display: 'inline-flex', alignItems: 'center' }}
                >
                  查看词条 ›
                </Link>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <p className="muted local-relation-graph-hint">点击节点或关系线查看详情</p>
      )}
    </div>
  );
}
