import type { EntityGraphNode, EntityRelation } from '@/lib/api';

export type RelationFilterKey = 'all' | 'family' | 'companion' | 'place' | 'event';

export const RELATION_FILTERS: { key: RelationFilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'family', label: '家族' },
  { key: 'companion', label: '同工' },
  { key: 'place', label: '地点' },
  { key: 'event', label: '事件' },
];

export function relationCategory(type: string | undefined): Exclude<RelationFilterKey, 'all'> {
  const t = (type || '').toLowerCase();
  if (['parent', 'child', 'sibling', 'spouse'].includes(t)) return 'family';
  if (['disciple', 'mentor', 'companion', 'coworker', 'teacher'].includes(t)) return 'companion';
  if (['located_at', 'contains', 'near', 'born_at', 'died_at'].includes(t)) return 'place';
  if (t === 'event') return 'event';
  return 'companion';
}

export function filterRelationEdges<T extends { type: string }>(
  edges: T[],
  filter: RelationFilterKey,
): T[] {
  if (filter === 'all') return edges;
  return edges.filter((e) => relationCategory(e.type) === filter);
}

export function edgePeerId(edge: EntityRelation, nodeId: string): string {
  return edge.from === nodeId ? edge.to : edge.from;
}

/** 与中心人物相连的一度边 */
export function centerNeighborEdges(centerId: string, edges: EntityRelation[]): EntityRelation[] {
  return edges.filter((e) => e.from === centerId || e.to === centerId);
}

/** 选中节点与图中其他可见节点的二度边（不含中心） */
export function secondHopEdges(
  centerId: string,
  nodeId: string,
  edges: EntityRelation[],
): EntityRelation[] {
  return edges.filter((e) => {
    const a = e.from;
    const b = e.to;
    if (a !== nodeId && b !== nodeId) return false;
    const other = a === nodeId ? b : a;
    return other !== centerId && other !== nodeId;
  });
}

export type RelationLayoutNode = {
  node: EntityGraphNode;
  x: number;
  y: number;
  isCenter: boolean;
  edgeToCenter?: EntityRelation;
  edgeIndex?: number;
};

export function computeRelationLayout({
  centerId,
  centerNode,
  edges,
  nodes,
  cx,
  cy,
  baseR,
}: {
  centerId: string;
  centerNode: EntityGraphNode;
  edges: EntityRelation[];
  nodes: EntityGraphNode[];
  cx: number;
  cy: number;
  baseR: number;
}): { layoutNodes: RelationLayoutNode[]; drawableEdges: { edge: EntityRelation; index: number }[] } {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const neighborEdges = centerNeighborEdges(centerId, edges);

  const peerBuckets: Record<Exclude<RelationFilterKey, 'all'>, string[]> = {
    family: [],
    companion: [],
    place: [],
    event: [],
  };

  const peerEdge = new Map<string, EntityRelation>();
  for (const edge of neighborEdges) {
    const peer = edgePeerId(edge, centerId);
    peerEdge.set(peer, edge);
    const cat = relationCategory(edge.type);
    if (!peerBuckets[cat].includes(peer)) peerBuckets[cat].push(peer);
  }

  for (const n of nodes) {
    if (n.id === centerId || peerEdge.has(n.id)) continue;
    peerBuckets.companion.push(n.id);
  }

  const ringOrder: (keyof typeof peerBuckets)[] = ['family', 'companion', 'place', 'event'];
  const ringRadii = [baseR * 0.82, baseR, baseR * 1.14, baseR * 1.28];
  const positions = new Map<string, { x: number; y: number }>();

  ringOrder.forEach((cat, ringIdx) => {
    const ids = peerBuckets[cat];
    const r = ringRadii[ringIdx] ?? baseR;
    ids.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / Math.max(ids.length, 1) - Math.PI / 2 + ringIdx * 0.12;
      positions.set(id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    });
  });

  const layoutNodes: RelationLayoutNode[] = [
    { node: centerNode, x: cx, y: cy, isCenter: true },
  ];

  neighborEdges.forEach((edge, edgeIndex) => {
    const peer = edgePeerId(edge, centerId);
    const pos = positions.get(peer);
    if (!pos) return;
    const found = nodeById.get(peer);
    if (layoutNodes.some((n) => n.node.id === peer)) return;
    layoutNodes.push({
      node: found ?? { id: peer, name: edge.peer_name ?? peer, type: 'unknown' },
      x: pos.x,
      y: pos.y,
      isCenter: false,
      edgeToCenter: edge,
      edgeIndex,
    });
  });

  for (const [id, pos] of positions) {
    if (id === centerId || layoutNodes.some((n) => n.node.id === id)) continue;
    const found = nodeById.get(id);
    layoutNodes.push({
      node: found ?? { id, name: id, type: 'unknown' },
      x: pos.x,
      y: pos.y,
      isCenter: false,
    });
  }

  const drawableEdges = edges
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => {
      const a = positions.has(edge.from) || edge.from === centerId;
      const b = positions.has(edge.to) || edge.to === centerId;
      return (edge.from === centerId || positions.has(edge.from))
        && (edge.to === centerId || positions.has(edge.to))
        && (a || edge.from === centerId)
        && (b || edge.to === centerId);
    });

  return { layoutNodes, drawableEdges };
}

export function sharedRefLabels(edge: EntityRelation | undefined, entityRefs?: string[]): string[] {
  const a = new Set((edge?.refs ?? []).map((r) => r.replace(/\s+/g, ' ').trim().toUpperCase()));
  if (!a.size || !entityRefs?.length) return [];
  return entityRefs
    .filter((r) => a.has(r.replace(/\s+/g, ' ').trim().toUpperCase()))
    .slice(0, 3);
}
