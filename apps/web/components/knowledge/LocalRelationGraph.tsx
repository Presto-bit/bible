'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { EntityGraph, EntityGraphNode, EntityRelation } from '@/lib/api';
import { entityDictionaryHref, entityGraphHref } from '@/lib/entity_knowledge';
import { entityTypeLabel } from '@/lib/dictionary_match';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { refSpaceToOsis } from '@/lib/inline_ref';
import {
  RELATION_FILTERS,
  centerNeighborEdges,
  computeRelationLayout,
  filterRelationEdges,
  relationCategory,
  secondHopEdges,
  type RelationFilterKey,
} from '@/lib/relation_graph';

const TYPE_COLOR: Record<string, string> = {
  person: '#3d6b8e',
  place: '#6b8a3d',
  term: '#8a6b3d',
  event: '#8a3d6b',
  unknown: '#8a7d6b',
};

type Selection =
  | { kind: 'center' }
  | { kind: 'node'; id: string }
  | { kind: 'edge'; index: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function touchDistance(touches: TouchList | React.TouchList) {
  if (touches.length < 2) return 0;
  const a = touches[0];
  const b = touches[1];
  if (!a || !b) return 0;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function LocalRelationGraph({
  graph,
  onNodeClick,
  onRefClick,
  variant = 'compact',
}: {
  graph: EntityGraph;
  onNodeClick?: (nodeId: string) => void;
  onRefClick?: (osis: string, label: string) => void;
  variant?: 'compact' | 'fullscreen';
}) {
  const center = graph.center;
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const scaleRef = useRef(1);
  const isFullscreen = variant === 'fullscreen';

  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [edgeFilter, setEdgeFilter] = useState<RelationFilterKey>('all');

  const w = isFullscreen ? 520 : 400;
  const h = isFullscreen ? 420 : 280;
  const cx = w / 2;
  const cy = h / 2;
  const baseR = isFullscreen ? 128 : 88;
  const maxScale = isFullscreen ? 3.2 : 2.4;

  const filteredEdges = useMemo(
    () => filterRelationEdges(graph.edges, edgeFilter),
    [graph.edges, edgeFilter],
  );

  const centerId = center?.id ?? center?.name ?? '';

  const { layoutNodes, drawableEdges, positions } = useMemo(() => {
    if (!center) {
      return { layoutNodes: [], drawableEdges: [], positions: new Map<string, { x: number; y: number }>() };
    }
    const centerNode: EntityGraphNode = {
      id: centerId,
      name: center.name,
      type: center.type ?? 'person',
    };
    const { layoutNodes: nodes, drawableEdges: draw } = computeRelationLayout({
      centerId,
      centerNode,
      edges: filteredEdges,
      nodes: graph.nodes,
      cx,
      cy,
      baseR,
    });
    const pos = new Map(nodes.map((n) => [n.node.id, { x: n.x, y: n.y }]));
    return { layoutNodes: nodes, drawableEdges: draw, positions: pos };
  }, [center, centerId, filteredEdges, graph.nodes, cx, cy, baseR]);

  useEffect(() => {
    setSelection(null);
  }, [centerId, edgeFilter]);

  const selectedEdge = selection?.kind === 'edge'
    ? filteredEdges[selection.index] ?? null
    : null;

  const selectedNode = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === 'center' && center) {
      return layoutNodes.find((n) => n.isCenter)?.node ?? null;
    }
    if (selection.kind === 'node') {
      return layoutNodes.find((n) => n.node.id === selection.id)?.node ?? null;
    }
    return null;
  }, [selection, layoutNodes, center]);

  const selectedNodeEdge = useMemo(() => {
    if (!selectedNode || selectedNode.id === centerId) return null;
    return centerNeighborEdges(centerId, filteredEdges).find(
      (e) => e.from === selectedNode.id || e.to === selectedNode.id,
    ) ?? null;
  }, [selectedNode, centerId, filteredEdges]);

  const extraHops = useMemo(() => {
    if (!selectedNode || selectedNode.id === centerId) return [];
    return secondHopEdges(centerId, selectedNode.id, filteredEdges);
  }, [selectedNode, centerId, filteredEdges]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      const p = pinchRef.current;
      if (!p || e.touches.length < 2) return;
      e.preventDefault();
      const dist = touchDistance(e.touches);
      if (!dist || !p.dist) return;
      setScale(clamp(p.scale * (dist / p.dist), 0.5, maxScale));
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, [maxScale]);

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => clamp(Number((s + delta).toFixed(2)), 0.5, maxScale));
  }, [maxScale]);

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
    if (e.button !== 0 || pinchRef.current) return;
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

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      dragRef.current = null;
      pinchRef.current = { dist: touchDistance(e.touches), scale: scaleRef.current };
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    pinchRef.current = null;
  }, []);

  const selectNode = useCallback((node: EntityGraphNode, isCenter: boolean) => {
    setSelection(isCenter ? { kind: 'center' } : { kind: 'node', id: node.id });
  }, []);

  const selectEdge = useCallback((index: number) => {
    setSelection({ kind: 'edge', index });
  }, []);

  const filterCounts = useMemo(() => {
    const counts = new Map<RelationFilterKey, number>();
    for (const f of RELATION_FILTERS) {
      counts.set(f.key, filterRelationEdges(graph.edges, f.key).length);
    }
    return counts;
  }, [graph.edges]);

  if (!center) {
    return <p className="muted" style={{ fontSize: 13 }}>暂无关系数据</p>;
  }

  return (
    <div className={`local-relation-graph${isFullscreen ? ' local-relation-graph--fullscreen' : ''}`}>
      <div className="local-relation-graph-toolbar">
        <span className="muted" style={{ fontSize: 11 }}>拖动画布 · 双指/滚轮缩放 · 点节点/连线看详情</span>
        <div className="local-relation-graph-zoom">
          <button type="button" className="font-pill" aria-label="缩小" onClick={() => zoomBy(-0.2)}>−</button>
          <button type="button" className="font-pill" aria-label="重置" onClick={resetView}>1×</button>
          <button type="button" className="font-pill" aria-label="放大" onClick={() => zoomBy(0.2)}>+</button>
        </div>
      </div>

      <div className="local-relation-graph-filters" role="tablist" aria-label="关系筛选">
        {RELATION_FILTERS.map((f) => {
          const count = filterCounts.get(f.key) ?? 0;
          if (f.key !== 'all' && count === 0) return null;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={edgeFilter === f.key}
              className={`font-pill${edgeFilter === f.key ? ' accent' : ''}`}
              onClick={() => setEdgeFilter(f.key)}
            >
              {f.label}{count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>

      <div
        ref={viewportRef}
        className="local-relation-graph-viewport"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
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
          <circle cx={cx} cy={cy} r={baseR * 1.35} fill="none" stroke="var(--line, #e0d8cc)" strokeWidth="1" />
          {drawableEdges.map(({ edge, index }) => {
            const fromPos = positions.get(edge.from) ?? (edge.from === centerId ? { x: cx, y: cy } : null);
            const toPos = positions.get(edge.to) ?? (edge.to === centerId ? { x: cx, y: cy } : null);
            if (!fromPos || !toPos) return null;
            const edgeSelected = selection?.kind === 'edge' && selection.index === index;
            const isCenterSpoke = edge.from === centerId || edge.to === centerId;
            return (
              <g key={`edge-${edge.from}-${edge.to}-${index}`}>
                <line
                  x1={fromPos.x}
                  y1={fromPos.y}
                  x2={toPos.x}
                  y2={toPos.y}
                  stroke={edgeSelected ? 'var(--accent, #3d6b8e)' : 'var(--line, #d8d0c4)'}
                  strokeWidth={edgeSelected ? 2.5 : isCenterSpoke ? 1.2 : 0.9}
                  strokeDasharray={isCenterSpoke ? undefined : '4 3'}
                  opacity={isCenterSpoke ? 1 : 0.75}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectEdge(index);
                  }}
                />
                {edge.label && isCenterSpoke ? (
                  <text
                    x={(fromPos.x + toPos.x) / 2}
                    y={(fromPos.y + toPos.y) / 2 - 4}
                    textAnchor="middle"
                    fontSize="9"
                    fill={edgeSelected ? 'var(--accent, #3d6b8e)' : 'var(--ink-muted, #8a7d6b)'}
                    style={{ cursor: 'pointer', pointerEvents: 'all' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectEdge(index);
                    }}
                  >
                    {edge.label.length > 10 ? `${edge.label.slice(0, 10)}…` : edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {layoutNodes.map(({ node, x, y, isCenter }, i) => {
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
              <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                {RELATION_FILTERS.find((f) => f.key === relationCategory(selectedEdge.type))?.label
                  ?? selectedEdge.type}
              </span>
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
              {selectedNodeEdge ? (
                <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                  与{center.name}：{selectedNodeEdge.label}
                </p>
              ) : null}
              {extraHops.length > 0 ? (
                <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                  其他关联：
                  {extraHops.slice(0, 4).map((e) => {
                    const other = e.from === selectedNode.id ? e.to : e.from;
                    const name = graph.nodes.find((n) => n.id === other)?.name ?? other;
                    return `${name}（${e.label}）`;
                  }).join('、')}
                  {extraHops.length > 4 ? '…' : ''}
                </p>
              ) : null}
              {(selectedNodeEdge?.refs ?? []).length > 0 ? (
                <div className="share-actions" style={{ marginTop: 8 }}>
                  <span className="muted" style={{ fontSize: 11, width: '100%' }}>关系经节</span>
                  {(selectedNodeEdge?.refs ?? []).slice(0, 4).map((ref) => (
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
              ) : null}
              <div className="share-actions" style={{ marginTop: 10 }}>
                {onNodeClick ? (
                  <button
                    type="button"
                    className="font-pill"
                    onClick={() => onNodeClick(selectedNode.id)}
                  >
                    切换为中心
                  </button>
                ) : null}
                <Link
                  href={entityDictionaryHref({ id: selectedNode.id, name: selectedNode.name, type: selectedNode.type, summary: '', refs: [] })}
                  className="font-pill"
                  style={{ display: 'inline-flex', alignItems: 'center' }}
                >
                  查看词条 ›
                </Link>
                {!isFullscreen ? (
                  <Link href={entityGraphHref(selectedNode.id)} className="font-pill">
                    全屏关系图 ›
                  </Link>
                ) : null}
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
