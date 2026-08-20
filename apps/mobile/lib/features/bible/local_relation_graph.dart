/// 交互式实体关系图，对齐 PWA `LocalRelationGraph.tsx`。
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/ref_label.dart';
import '../../core/theme.dart';
import 'content_repository.dart';
import 'dictionary_match.dart';

enum RelationFilterKey { all, family, companion, place, event }

const _relationFilters = <(RelationFilterKey, String)>[
  (RelationFilterKey.all, '全部'),
  (RelationFilterKey.family, '家族'),
  (RelationFilterKey.companion, '同工'),
  (RelationFilterKey.place, '地点'),
  (RelationFilterKey.event, '事件'),
];

const _typeColor = <String, Color>{
  'person': Color(0xFF3D6B8E),
  'place': Color(0xFF6B8A3D),
  'term': Color(0xFF8A6B3D),
  'event': Color(0xFF8A3D6B),
  'unknown': Color(0xFF8A7D6B),
};

/// 把当前词条 id/name 对齐到关系边端点，避免中心落错节点。
String resolveGraphCenterId(GraphData graph, DictEntity entity) {
  final ids = <String>{
    if (graph.center?.id.isNotEmpty == true) graph.center!.id,
    if (graph.center?.name.isNotEmpty == true) graph.center!.name,
    if (entity.id.isNotEmpty) entity.id,
    if (entity.name.isNotEmpty) entity.name,
  };
  for (final id in ids) {
    if (graph.edges.any((e) => e.from == id || e.to == id)) return id;
  }
  for (final n in graph.nodes) {
    if (ids.contains(n.id) || ids.contains(n.name)) return n.id;
  }
  if (graph.center?.id.isNotEmpty == true) return graph.center!.id;
  if (graph.center?.name.isNotEmpty == true) return graph.center!.name;
  return entity.id.isNotEmpty ? entity.id : entity.name;
}

Matrix4 matrixForCenteredScale(double scale, double cx, double cy) {
  return Matrix4.identity()
    ..translate(cx, cy)
    ..scale(scale)
    ..translate(-cx, -cy);
}

enum LocalRelationGraphVariant { compact, fullscreen }

enum _GraphSelectionKind { center, node, edge }

class _GraphSelection {
  const _GraphSelection.center() : kind = _GraphSelectionKind.center, nodeId = null, edgeIndex = null;
  const _GraphSelection.node(this.nodeId)
      : kind = _GraphSelectionKind.node,
        edgeIndex = null;
  const _GraphSelection.edge(this.edgeIndex)
      : kind = _GraphSelectionKind.edge,
        nodeId = null;

  final _GraphSelectionKind kind;
  final String? nodeId;
  final int? edgeIndex;
}

RelationFilterKey relationCategory(String? type) {
  final t = (type ?? '').toLowerCase();
  if (['parent', 'child', 'sibling', 'spouse'].contains(t)) {
    return RelationFilterKey.family;
  }
  if (['disciple', 'mentor', 'companion', 'coworker', 'teacher'].contains(t)) {
    return RelationFilterKey.companion;
  }
  if (['located_at', 'contains', 'near', 'born_at', 'died_at'].contains(t)) {
    return RelationFilterKey.place;
  }
  if (t == 'event') return RelationFilterKey.event;
  return RelationFilterKey.companion;
}

List<GraphEdge> filterRelationEdges(
  List<GraphEdge> edges,
  RelationFilterKey filter,
) {
  if (filter == RelationFilterKey.all) return edges;
  return edges
      .where((e) => relationCategory(e.type) == filter)
      .toList();
}

String edgePeerId(GraphEdge edge, String nodeId) =>
    edge.from == nodeId ? edge.to : edge.from;

List<GraphEdge> centerNeighborEdges(String centerId, List<GraphEdge> edges) =>
    edges.where((e) => e.from == centerId || e.to == centerId).toList();

List<GraphEdge> secondHopEdges(
  String centerId,
  String nodeId,
  List<GraphEdge> edges,
) {
  return edges.where((e) {
    final a = e.from;
    final b = e.to;
    if (a != nodeId && b != nodeId) return false;
    final other = a == nodeId ? b : a;
    return other != centerId && other != nodeId;
  }).toList();
}

class RelationLayoutNode {
  RelationLayoutNode({
    required this.node,
    required this.x,
    required this.y,
    required this.isCenter,
    this.edgeToCenter,
    this.edgeIndex,
  });

  final GraphNode node;
  final double x;
  final double y;
  final bool isCenter;
  final GraphEdge? edgeToCenter;
  final int? edgeIndex;
}

({List<RelationLayoutNode> layoutNodes, List<(GraphEdge edge, int index)> drawableEdges})
computeRelationLayout({
  required String centerId,
  required GraphNode centerNode,
  required List<GraphEdge> edges,
  required List<GraphNode> nodes,
  required double cx,
  required double cy,
  required double baseR,
  bool strictNeighborsOnly = false,
}) {
  final nodeById = {for (final n in nodes) n.id: n};
  final neighborEdges = centerNeighborEdges(centerId, edges);

  final peerBuckets = <RelationFilterKey, List<String>>{
    RelationFilterKey.family: [],
    RelationFilterKey.companion: [],
    RelationFilterKey.place: [],
    RelationFilterKey.event: [],
  };
  final peerEdge = <String, GraphEdge>{};
  for (final edge in neighborEdges) {
    final peer = edgePeerId(edge, centerId);
    peerEdge[peer] = edge;
    final cat = relationCategory(edge.type);
    if (!peerBuckets[cat]!.contains(peer)) peerBuckets[cat]!.add(peer);
  }

  if (!strictNeighborsOnly) {
    for (final n in nodes) {
      if (n.id == centerId || peerEdge.containsKey(n.id)) continue;
      peerBuckets[RelationFilterKey.companion]!.add(n.id);
    }
  }

  const ringOrder = [
    RelationFilterKey.family,
    RelationFilterKey.companion,
    RelationFilterKey.place,
    RelationFilterKey.event,
  ];
  final ringRadii = [baseR * 0.82, baseR, baseR * 1.14, baseR * 1.28];
  final positions = <String, Offset>{};

  if (strictNeighborsOnly) {
    final peers = peerEdge.keys.toList();
    for (var i = 0; i < peers.length; i++) {
      final angle = (2 * math.pi * i) / math.max(peers.length, 1) - math.pi / 2;
      positions[peers[i]] = Offset(
        cx + baseR * math.cos(angle),
        cy + baseR * math.sin(angle),
      );
    }
  } else {
    for (var ringIdx = 0; ringIdx < ringOrder.length; ringIdx++) {
      final cat = ringOrder[ringIdx];
      final ids = peerBuckets[cat]!;
      final r = ringRadii[ringIdx];
      for (var i = 0; i < ids.length; i++) {
        final angle =
            (2 * math.pi * i) / math.max(ids.length, 1) -
            math.pi / 2 +
            ringIdx * 0.12;
        positions[ids[i]] = Offset(
          cx + r * math.cos(angle),
          cy + r * math.sin(angle),
        );
      }
    }
  }

  final layoutNodes = <RelationLayoutNode>[
    RelationLayoutNode(
      node: centerNode,
      x: cx,
      y: cy,
      isCenter: true,
    ),
  ];

  for (var edgeIndex = 0; edgeIndex < neighborEdges.length; edgeIndex++) {
    final edge = neighborEdges[edgeIndex];
    final peer = edgePeerId(edge, centerId);
    final pos = positions[peer];
    if (pos == null) continue;
    if (layoutNodes.any((n) => n.node.id == peer)) continue;
    layoutNodes.add(
      RelationLayoutNode(
        node: nodeById[peer] ??
            GraphNode(
              id: peer,
              name: edge.peerName ?? peer,
              type: 'unknown',
            ),
        x: pos.dx,
        y: pos.dy,
        isCenter: false,
        edgeToCenter: edge,
        edgeIndex: edgeIndex,
      ),
    );
  }

  if (!strictNeighborsOnly) {
    for (final entry in positions.entries) {
      final id = entry.key;
      final pos = entry.value;
      if (id == centerId || layoutNodes.any((n) => n.node.id == id)) continue;
      layoutNodes.add(
        RelationLayoutNode(
          node: nodeById[id] ?? GraphNode(id: id, name: id, type: 'unknown'),
          x: pos.dx,
          y: pos.dy,
          isCenter: false,
        ),
      );
    }
  }

  final drawableEdges = <(GraphEdge, int)>[];
  if (strictNeighborsOnly) {
    for (var index = 0; index < neighborEdges.length; index++) {
      drawableEdges.add((neighborEdges[index], index));
    }
  } else {
    for (var index = 0; index < edges.length; index++) {
      final edge = edges[index];
      final a = positions.containsKey(edge.from) || edge.from == centerId;
      final b = positions.containsKey(edge.to) || edge.to == centerId;
      if ((edge.from == centerId || positions.containsKey(edge.from)) &&
          (edge.to == centerId || positions.containsKey(edge.to)) &&
          (a || edge.from == centerId) &&
          (b || edge.to == centerId)) {
        drawableEdges.add((edge, index));
      }
    }
  }

  return (layoutNodes: layoutNodes, drawableEdges: drawableEdges);
}

class LocalRelationGraph extends StatefulWidget {
  const LocalRelationGraph({
    super.key,
    required this.graph,
    this.focusEntity,
    this.onRefClick,
    this.onNodeClick,
    this.onOpenFullscreen,
    this.variant = LocalRelationGraphVariant.compact,
  });

  final GraphData graph;
  final DictEntity? focusEntity;
  final void Function(String ref)? onRefClick;
  final void Function(String nodeId)? onNodeClick;
  final VoidCallback? onOpenFullscreen;
  final LocalRelationGraphVariant variant;

  @override
  State<LocalRelationGraph> createState() => _LocalRelationGraphState();
}

class _LocalRelationGraphState extends State<LocalRelationGraph> {
  final _transform = TransformationController();
  _GraphSelection? _selection;
  RelationFilterKey _edgeFilter = RelationFilterKey.all;
  double? _canvasCx;
  double? _canvasCy;

  bool get _isFullscreen =>
      widget.variant == LocalRelationGraphVariant.fullscreen;

  double get _defaultScale => _isFullscreen ? 1.25 : 1.0;

  double get _maxScale => _isFullscreen ? 3.6 : 2.4;

  DictEntity? get _center => widget.graph.center;

  String get _centerId {
    final c = _center;
    if (c == null) return '';
    if (widget.focusEntity != null) {
      return resolveGraphCenterId(widget.graph, widget.focusEntity!);
    }
    if (c.id.isNotEmpty) return c.id;
    return c.name;
  }

  @override
  void dispose() {
    _transform.dispose();
    super.dispose();
  }

  void _resetView() {
    final cx = _canvasCx;
    final cy = _canvasCy;
    if (cx == null || cy == null) return;
    _transform.value = matrixForCenteredScale(_defaultScale, cx, cy);
  }

  void _zoomBy(double delta) {
    final cx = _canvasCx;
    final cy = _canvasCy;
    if (cx == null || cy == null) return;
    final scale = _transform.value.getMaxScaleOnAxis().clamp(0.5, _maxScale);
    final next = (scale + delta).clamp(0.5, _maxScale);
    if (next == scale) return;
    _transform.value = matrixForCenteredScale(next, cx, cy);
  }

  void _selectNode(GraphNode node, {required bool isCenter}) {
    setState(() {
      _selection = isCenter
          ? const _GraphSelection.center()
          : _GraphSelection.node(node.id);
    });
  }

  void _selectEdge(int index) {
    setState(() => _selection = _GraphSelection.edge(index));
  }

  @override
  Widget build(BuildContext context) {
    final center = _center;
    if (center == null) {
      return const Text('暂无关系数据', style: TextStyle(color: AppColors.inkFaint));
    }

    final centerId = _centerId;
    final filteredEdges = filterRelationEdges(widget.graph.edges, _edgeFilter);
    final centerNode = GraphNode(
      id: centerId,
      name: center.name,
      type: center.type,
    );

    GraphEdge? selectedEdge;
    if (_selection?.kind == _GraphSelectionKind.edge) {
      final i = _selection!.edgeIndex!;
      if (i >= 0 && i < filteredEdges.length) selectedEdge = filteredEdges[i];
    }

    GraphNode? selectedNode;
    if (_selection?.kind == _GraphSelectionKind.center) {
      selectedNode = centerNode;
    } else if (_selection?.kind == _GraphSelectionKind.node) {
      final id = _selection!.nodeId!;
      GraphNode? found;
      for (final n in widget.graph.nodes) {
        if (n.id == id) {
          found = n;
          break;
        }
      }
      selectedNode = found ?? GraphNode(id: id, name: id, type: 'unknown');
    }

    GraphEdge? selectedNodeEdge;
    if (selectedNode != null && selectedNode.id != centerId) {
      for (final e in centerNeighborEdges(centerId, filteredEdges)) {
        if (e.from == selectedNode.id || e.to == selectedNode.id) {
          selectedNodeEdge = e;
          break;
        }
      }
    }
    final extraHops = selectedNode == null || selectedNode.id == centerId
        ? const <GraphEdge>[]
        : secondHopEdges(centerId, selectedNode.id, filteredEdges);

    final filterCounts = {
      for (final f in _relationFilters)
        f.$1: filterRelationEdges(widget.graph.edges, f.$1).length,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                '拖动画布 · 双指缩放 · 点节点/连线看详情',
                style: TextStyle(fontSize: 11, color: AppColors.inkFaint),
              ),
            ),
            _ZoomPill(label: '−', onTap: () => _zoomBy(-0.2)),
            const SizedBox(width: 4),
            _ZoomPill(label: '1×', onTap: _resetView),
            const SizedBox(width: 4),
            _ZoomPill(label: '+', onTap: () => _zoomBy(0.2)),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final (key, label) in _relationFilters)
              if (key == RelationFilterKey.all ||
                  (filterCounts[key] ?? 0) > 0)
                _FilterPill(
                  label: '${label}${(filterCounts[key] ?? 0) > 0 && key != RelationFilterKey.all ? ' ${filterCounts[key]}' : ''}',
                  active: _edgeFilter == key,
                  onTap: () => setState(() {
                    _edgeFilter = key;
                    _selection = null;
                  }),
                ),
          ],
        ),
        const SizedBox(height: 8),
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final w = _isFullscreen ? constraints.maxWidth : 400.0;
              final h = _isFullscreen ? constraints.maxHeight : 280.0;
              final baseR = _isFullscreen ? math.min(w, h) * 0.26 : 88.0;
              final cx = w / 2;
              final cy = h / 2;
              if (_canvasCx != cx || _canvasCy != cy) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (!mounted) return;
                  if (_canvasCx == cx && _canvasCy == cy) return;
                  _canvasCx = cx;
                  _canvasCy = cy;
                  _transform.value =
                      matrixForCenteredScale(_defaultScale, cx, cy);
                });
              }

              final layout = computeRelationLayout(
                centerId: centerId,
                centerNode: centerNode,
                edges: filteredEdges,
                nodes: widget.graph.nodes,
                cx: cx,
                cy: cy,
                baseR: baseR,
                strictNeighborsOnly: _edgeFilter != RelationFilterKey.all,
              );
              final positions = {
                for (final n in layout.layoutNodes) n.node.id: Offset(n.x, n.y),
              };

              return DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.surfaceSunken,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.line),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: InteractiveViewer(
                    transformationController: _transform,
                    minScale: 0.5,
                    maxScale: _maxScale,
                    boundaryMargin: const EdgeInsets.all(48),
                    alignment: Alignment.center,
                    child: SizedBox(
                      width: w,
                      height: h,
                      child: GestureDetector(
                        behavior: HitTestBehavior.translucent,
                        onTapUp: (d) => _handleCanvasTap(
                          d.localPosition,
                          layout: layout,
                          positions: positions,
                          centerId: centerId,
                          canvasCx: cx,
                          canvasCy: cy,
                          filteredEdges: filteredEdges,
                        ),
                        child: CustomPaint(
                          painter: _RelationGraphPainter(
                            layoutNodes: layout.layoutNodes,
                            drawableEdges: layout.drawableEdges,
                            positions: positions,
                            centerId: centerId,
                            baseR: baseR,
                            w: w,
                            h: h,
                            selection: _selection,
                          ),
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: [
                              for (final ln in layout.layoutNodes)
                                _NodeHitTarget(
                                  layoutNode: ln,
                                  selected: _isNodeSelected(ln),
                                  onTap: () => _selectNode(
                                    ln.node,
                                    isCenter: ln.isCenter,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        if (_selection != null)
          _DetailCard(
            centerName: center.name,
            selectedEdge: selectedEdge,
            selectedNode: selectedNode,
            selectedNodeEdge: selectedNodeEdge,
            extraHops: extraHops,
            graphNodes: widget.graph.nodes,
            onRefClick: widget.onRefClick,
            onNodeClick: widget.onNodeClick,
            onOpenFullscreen: _isFullscreen ? null : widget.onOpenFullscreen,
          )
        else
          Row(
            children: [
              const Expanded(
                child: Text(
                  '点击节点或关系线查看详情',
                  style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
                ),
              ),
              if (widget.onOpenFullscreen != null)
                TextButton(
                  onPressed: widget.onOpenFullscreen,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.accentDeep,
                    padding: EdgeInsets.zero,
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('全屏关系图 ›', style: TextStyle(fontSize: 13)),
                ),
            ],
          ),
      ],
    );
  }

  bool _isNodeSelected(RelationLayoutNode ln) {
    final s = _selection;
    if (s == null) return false;
    if (s.kind == _GraphSelectionKind.center) return ln.isCenter;
    if (s.kind == _GraphSelectionKind.node) return ln.node.id == s.nodeId;
    return false;
  }

  void _handleCanvasTap(
    Offset local, {
    required ({List<RelationLayoutNode> layoutNodes, List<(GraphEdge edge, int index)> drawableEdges}) layout,
    required Map<String, Offset> positions,
    required String centerId,
    required double canvasCx,
    required double canvasCy,
    required List<GraphEdge> filteredEdges,
  }) {
    for (final (edge, index) in layout.drawableEdges) {
      final fromPos = positions[edge.from] ??
          (edge.from == centerId ? Offset(canvasCx, canvasCy) : null);
      final toPos = positions[edge.to] ??
          (edge.to == centerId ? Offset(canvasCx, canvasCy) : null);
      if (fromPos == null || toPos == null) continue;
      if (_distanceToSegment(local, fromPos, toPos) <= 14) {
        _selectEdge(index);
        return;
      }
    }
  }
}

class _ZoomPill extends StatelessWidget {
  const _ZoomPill({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: AppColors.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 32,
          height: 28,
          child: Center(
            child: Text(label, style: const TextStyle(fontSize: 13)),
          ),
        ),
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? AppColors.accentWash : AppColors.surface,
      shape: StadiumBorder(
        side: BorderSide(color: active ? AppColors.accent : AppColors.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: active ? AppColors.accent : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}

class _NodeHitTarget extends StatelessWidget {
  const _NodeHitTarget({
    required this.layoutNode,
    required this.selected,
    required this.onTap,
  });

  final RelationLayoutNode layoutNode;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ln = layoutNode;
    final isCenter = ln.isCenter;
    final radius = isCenter ? 20.0 : 16.0;
    final inner = ln.node.name.isEmpty
        ? ln.node.id
        : (ln.node.name.length > (isCenter ? 4 : 3)
            ? ln.node.name.substring(0, isCenter ? 4 : 3)
            : ln.node.name);
    final outer = ln.node.name.length > 8
        ? '${ln.node.name.substring(0, 8)}…'
        : ln.node.name;
    final color = _typeColor[ln.node.type ?? 'unknown'] ?? _typeColor['unknown']!;
    const hitW = 72.0;

    return Positioned(
      left: ln.x - hitW / 2,
      top: ln.y - radius - 4,
      width: hitW,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.translucent,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: (radius + (selected ? 3 : 0)) * 2,
              height: (radius + (selected ? 3 : 0)) * 2,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: color.withValues(alpha: selected ? 1 : 0.92),
                shape: BoxShape.circle,
                border: selected
                    ? Border.all(color: Colors.white, width: 2)
                    : null,
              ),
              child: Text(
                inner,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: isCenter ? 10 : 9,
                  fontWeight: isCenter ? FontWeight.w700 : FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 2),
            SizedBox(
              width: 72,
              child: Text(
                outer,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 9,
                  color: AppColors.ink,
                  height: 1.2,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RelationGraphPainter extends CustomPainter {
  _RelationGraphPainter({
    required this.layoutNodes,
    required this.drawableEdges,
    required this.positions,
    required this.centerId,
    required this.baseR,
    required this.w,
    required this.h,
    required this.selection,
  });

  final List<RelationLayoutNode> layoutNodes;
  final List<(GraphEdge edge, int index)> drawableEdges;
  final Map<String, Offset> positions;
  final String centerId;
  final double baseR;
  final double w;
  final double h;
  final _GraphSelection? selection;

  @override
  void paint(Canvas canvas, Size size) {
    final cx = w / 2;
    final cy = h / 2;
    canvas.drawCircle(
      Offset(cx, cy),
      baseR * 1.35,
      Paint()
        ..color = AppColors.line
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );

    for (final (edge, index) in drawableEdges) {
      final fromPos = positions[edge.from] ??
          (edge.from == centerId ? Offset(cx, cy) : null);
      final toPos = positions[edge.to] ??
          (edge.to == centerId ? Offset(cx, cy) : null);
      if (fromPos == null || toPos == null) continue;

      final edgeSelected =
          selection?.kind == _GraphSelectionKind.edge && selection!.edgeIndex == index;
      final isCenterSpoke = edge.from == centerId || edge.to == centerId;
      final paint = Paint()
        ..color = edgeSelected ? AppColors.accent : AppColors.line
        ..strokeWidth = edgeSelected ? 2.5 : (isCenterSpoke ? 1.2 : 0.9)
        ..style = PaintingStyle.stroke;
      if (!isCenterSpoke) {
        paint.strokeCap = StrokeCap.round;
        _drawDashedLine(canvas, fromPos, toPos, paint);
      } else {
        canvas.drawLine(fromPos, toPos, paint);
      }

      final label = (edge.label ?? '').trim();
      if (label.isNotEmpty && isCenterSpoke) {
        final mid = Offset(
          (fromPos.dx + toPos.dx) / 2,
          (fromPos.dy + toPos.dy) / 2 - 4,
        );
        final short = label.length > 10 ? '${label.substring(0, 10)}…' : label;
        final tp = TextPainter(
          text: TextSpan(
            text: short,
            style: TextStyle(
              fontSize: 9,
              color: edgeSelected ? AppColors.accent : AppColors.inkFaint,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        tp.paint(canvas, Offset(mid.dx - tp.width / 2, mid.dy - tp.height / 2));
      }
    }
  }

  void _drawDashedLine(Canvas canvas, Offset a, Offset b, Paint paint) {
    const dash = 4.0;
    const gap = 3.0;
    final delta = b - a;
    final len = delta.distance;
    if (len == 0) return;
    final dir = delta / len;
    var dist = 0.0;
    while (dist < len) {
      final start = a + dir * dist;
      final end = a + dir * math.min(dist + dash, len);
      canvas.drawLine(start, end, paint);
      dist += dash + gap;
    }
  }

  @override
  bool shouldRepaint(covariant _RelationGraphPainter oldDelegate) =>
      oldDelegate.selection != selection ||
      oldDelegate.drawableEdges.length != drawableEdges.length;
}

class _DetailCard extends StatelessWidget {
  const _DetailCard({
    required this.centerName,
    required this.selectedEdge,
    required this.selectedNode,
    required this.selectedNodeEdge,
    required this.extraHops,
    required this.graphNodes,
    this.onRefClick,
    this.onNodeClick,
    this.onOpenFullscreen,
  });

  final String centerName;
  final GraphEdge? selectedEdge;
  final GraphNode? selectedNode;
  final GraphEdge? selectedNodeEdge;
  final List<GraphEdge> extraHops;
  final List<GraphNode> graphNodes;
  final void Function(String ref)? onRefClick;
  final void Function(String nodeId)? onNodeClick;
  final VoidCallback? onOpenFullscreen;

  @override
  Widget build(BuildContext context) {
    final nodeById = {for (final n in graphNodes) n.id: n.name};

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (selectedEdge != null) ...[
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: selectedEdge!.label ?? selectedEdge!.type ?? '相关',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                  TextSpan(
                    text:
                        '  ${_filterLabel(relationCategory(selectedEdge!.type))}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.inkFaint,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Text(
              selectedEdge!.peerName ?? selectedEdge!.to,
              style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
            ),
            const SizedBox(height: 8),
            _RefPills(refs: selectedEdge!.refs, onRefClick: onRefClick),
          ] else if (selectedNode != null) ...[
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: selectedNode!.name,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                  if (entityTypeLabel(selectedNode!.type ?? '').isNotEmpty)
                    TextSpan(
                      text: '  ${entityTypeLabel(selectedNode!.type ?? '')}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.inkFaint,
                      ),
                    ),
                ],
              ),
            ),
            if (selectedNodeEdge != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '与$centerName：${selectedNodeEdge!.label ?? selectedNodeEdge!.type ?? '相关'}',
                  style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
                ),
              ),
            if (extraHops.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '其他关联：${extraHops.take(4).map((e) {
                    final other = e.from == selectedNode!.id ? e.to : e.from;
                    final name = nodeById[other] ?? other;
                    return '$name（${e.label ?? e.type ?? '相关'}）';
                  }).join('、')}${extraHops.length > 4 ? '…' : ''}',
                  style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
                ),
              ),
            if (selectedNodeEdge != null && selectedNodeEdge!.refs.isNotEmpty) ...[
              const SizedBox(height: 8),
              const Text(
                '关系经节',
                style: TextStyle(fontSize: 11, color: AppColors.inkFaint),
              ),
              const SizedBox(height: 4),
              _RefPills(refs: selectedNodeEdge!.refs, onRefClick: onRefClick),
            ],
            if (onNodeClick != null || onOpenFullscreen != null) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  if (onNodeClick != null)
                    _ActionPill(
                      label: '切换为中心',
                      onTap: () => onNodeClick!(selectedNode!.id),
                    ),
                  if (onOpenFullscreen != null)
                    _ActionPill(
                      label: '全屏关系图 ›',
                      onTap: onOpenFullscreen!,
                    ),
                ],
              ),
            ],
          ],
        ],
      ),
    );
  }

  String _filterLabel(RelationFilterKey key) =>
      _relationFilters.firstWhere((f) => f.$1 == key).$2;
}

class _RefPills extends StatelessWidget {
  const _RefPills({required this.refs, this.onRefClick});
  final List<String> refs;
  final void Function(String ref)? onRefClick;

  @override
  Widget build(BuildContext context) {
    if (refs.isEmpty) {
      return const Text('暂无经节依据', style: TextStyle(fontSize: 12, color: AppColors.inkFaint));
    }
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final r in refs.take(6))
          _ActionPill(
            label: formatGroupRefLabel(r),
            onTap: onRefClick == null ? null : () => onRefClick!(r),
          ),
      ],
    );
  }
}

class _ActionPill extends StatelessWidget {
  const _ActionPill({required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: AppColors.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
        ),
      ),
    );
  }
}

double _distanceToSegment(Offset p, Offset a, Offset b) {
  final ab = b - a;
  final len2 = ab.dx * ab.dx + ab.dy * ab.dy;
  if (len2 == 0) return (p - a).distance;
  final t = ((p.dx - a.dx) * ab.dx + (p.dy - a.dy) * ab.dy) / len2;
  final clamped = t.clamp(0.0, 1.0);
  final proj = Offset(a.dx + ab.dx * clamped, a.dy + ab.dy * clamped);
  return (p - proj).distance;
}
