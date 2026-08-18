/// 词典知识卡半屏：对齐 PWA EntityKnowledgeSheet（摘要 / 经节 / 地点 / 关系列表）。
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../app/app_shell.dart' show navIndexProvider, readerImmersiveProvider;
import '../../core/badge_stats.dart';
import '../../core/config.dart';
import '../../core/ref_label.dart';
import '../../core/theme.dart';
import '../assistant/assistant_seed.dart';
import 'bible_repository.dart';
import 'content_repository.dart';
import 'dictionary_match.dart';
import 'reader_sheet.dart';

Future<void> showEntityKnowledgeSheet(
  BuildContext context,
  WidgetRef ref, {
  required DictEntity entity,
  required String displayName,
  List<DictEntity> candidates = const [],
}) async {
  final prevImmersive = ref.read(readerImmersiveProvider);
  ref.read(readerImmersiveProvider.notifier).set(true);
  try {
    await showReaderSheet<void>(
      context: context,
      // 对齐 PWA 的 max-height: 82vh，给关联资料留出阅读空间。
      heightFactor: 0.82,
      builder: (_) => _EntityKnowledgeSheet(
        entity: entity,
        displayName: displayName,
        candidates: candidates.isEmpty ? [entity] : candidates,
      ),
    );
  } finally {
    if (context.mounted) {
      ref.read(readerImmersiveProvider.notifier).set(prevImmersive);
    }
  }
}

Future<void> showInlineVersePreview(
  BuildContext context, {
  required String label,
  required String bookId,
  required int chapter,
}) {
  return showReaderSheet<void>(
    context: context,
    heightFactor: 0.55,
    builder: (_) =>
        _VersePreviewSheet(label: label, bookId: bookId, chapter: chapter),
  );
}

class _EntityKnowledgeSheet extends ConsumerStatefulWidget {
  const _EntityKnowledgeSheet({
    required this.entity,
    required this.displayName,
    required this.candidates,
  });

  final DictEntity entity;
  final String displayName;
  final List<DictEntity> candidates;

  @override
  ConsumerState<_EntityKnowledgeSheet> createState() =>
      _EntityKnowledgeSheetState();
}

class _EntityKnowledgeSheetState extends ConsumerState<_EntityKnowledgeSheet> {
  late DictEntity _entity = widget.entity;
  String _tab = 'refs';

  @override
  void didUpdateWidget(covariant _EntityKnowledgeSheet oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.entity.id != widget.entity.id) {
      _entity = widget.entity;
      _tab = 'refs';
    }
  }

  @override
  Widget build(BuildContext context) {
    final typeLabel = entityTypeLabel(_entity.type);
    final showSenses = widget.candidates.length > 1;
    final knowledgeAsync = ref.watch(entityKnowledgeProvider(_entity.id));
    final bottom = MediaQuery.paddingOf(context).bottom;

    return SizedBox.expand(
      child: knowledgeAsync.when(
          loading: () => _scaffold(
            typeLabel: typeLabel,
            showSenses: showSenses,
            summary: entitySummaryText(_entity),
            refs: _entity.refs,
            loading: true,
            bottomInset: bottom,
          ),
          error: (_, __) => _scaffold(
            typeLabel: typeLabel,
            showSenses: showSenses,
            summary: entitySummaryText(_entity),
            refs: _entity.refs,
            loading: false,
            bottomInset: bottom,
          ),
          data: (k) {
            final e = k.entity.id.isNotEmpty ? k.entity : _entity;
            // 对齐 PWA entityKnowledgeTabs：关系 → 经节 → 地图 → 图鉴。
            // 首开仍为「经节」，与 PWA `useState('refs')` 一致。
            final tabs = <String>[];
            if (k.graph != null && k.graph!.edges.isNotEmpty) {
              tabs.add('graph');
            }
            tabs.add('refs');
            if (k.place != null || k.mapTours.isNotEmpty) tabs.add('map');
            if (k.diagrams.isNotEmpty) tabs.add('diagram');
            final activeTab = tabs.contains(_tab) ? _tab : 'refs';
            if (activeTab != _tab) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) setState(() => _tab = activeTab);
              });
            }
            return _scaffold(
              typeLabel: typeLabel,
              showSenses: showSenses,
              summary: entitySummaryText(e),
              refs: e.refs.isNotEmpty ? e.refs : _entity.refs,
              loading: false,
              tabs: tabs,
              activeTab: activeTab,
              place: k.place,
              graph: k.graph,
              mapTours: k.mapTours,
              diagrams: k.diagrams,
              bottomInset: bottom,
            );
          },
        ),
    );
  }

  Widget _scaffold({
    required String typeLabel,
    required bool showSenses,
    required String summary,
    required List<String> refs,
    required bool loading,
    double bottomInset = 0,
    List<String> tabs = const ['refs'],
    String activeTab = 'refs',
    GeoPlace? place,
    GraphData? graph,
    List<MapTour> mapTours = const [],
    List<DiagramItem> diagrams = const [],
  }) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 12 + bottomInset),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: entityDisplayName(_entity),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink,
                        ),
                      ),
                      if (typeLabel.isNotEmpty)
                        TextSpan(
                          text: '  $typeLabel',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w400,
                            color: AppColors.inkFaint,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const ReaderSheetCloseButton(),
            ],
          ),
          if (showSenses) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                const Text(
                  '也可能是：',
                  style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
                ),
                for (final c in widget.candidates)
                  _DictSenseChip(
                    label: _senseLabel(c),
                    active: c.id == _entity.id,
                    onTap: () {
                      setState(() {
                        _entity = c;
                        _tab = 'refs';
                      });
                      ref.read(badgeStatsRecorderProvider).recordDictEntity(c.id);
                    },
                  ),
              ],
            ),
          ],
          const SizedBox(height: 8),
          Text(
            summary,
            style: const TextStyle(
              fontSize: 14,
              height: 1.7,
              color: AppColors.inkSoft,
            ),
          ),
          if (tabs.length > 1) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final t in tabs)
                  _KnowledgeTabPill(
                    label: _tabLabel(t),
                    active: activeTab == t,
                    onTap: () => setState(() => _tab = t),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Expanded(
            child: loading
                ? const Align(
                    alignment: Alignment.topLeft,
                    child: Text(
                      '加载中…',
                      style: TextStyle(fontSize: 13, color: AppColors.inkFaint),
                    ),
                  )
                : SingleChildScrollView(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _tabBody(
                      tab: activeTab,
                      refs: refs,
                      place: place,
                      graph: graph,
                      mapTours: mapTours,
                      diagrams: diagrams,
                    ),
                  ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _askAssistant,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.inkSoft,
                    side: const BorderSide(color: AppColors.line),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: const Text('问小爱'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed: _openDictionary,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.accent,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: const Text('全屏查看'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _tabBody({
    required String tab,
    required List<String> refs,
    GeoPlace? place,
    GraphData? graph,
    List<MapTour> mapTours = const [],
    List<DiagramItem> diagrams = const [],
  }) {
    switch (tab) {
      case 'map':
        if (place == null && mapTours.isEmpty) {
          return const Text(
            '暂无地图坐标',
            style: TextStyle(color: AppColors.inkFaint),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (place != null) ...[
              _GeoMiniMapPreview(place: place),
              const SizedBox(height: 6),
              const Text(
                '示意地图 · 非精确地理',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 11, color: AppColors.inkFaint),
              ),
            ],
            if (mapTours.isNotEmpty) ...[
              const SizedBox(height: 10),
              const Text(
                '所属路线',
                style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
              ),
              for (final tour in mapTours)
                TextButton(
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.only(top: 4, bottom: 4),
                    alignment: Alignment.centerLeft,
                  ),
                  onPressed: () => context.push('/search/map/${tour.id}'),
                  child: Text('${tour.title} ›'),
                ),
            ],
          ],
        );
      case 'graph':
        final nodes = graph?.nodes ?? const <GraphNode>[];
        final edges = graph?.edges ?? const <GraphEdge>[];
        if (nodes.isEmpty) {
          return const Text(
            '暂无关系',
            style: TextStyle(color: AppColors.inkFaint),
          );
        }
        final nodeNames = {for (final node in nodes) node.id: node.name};
        final centerId = _entity.id;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _LocalRelationGraphPreview(
              nodes: nodes.take(10).toList(),
              edges: edges.take(16).toList(),
              centerId: centerId,
            ),
            const SizedBox(height: 10),
            for (final edge in edges.take(12))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text.rich(
                  TextSpan(
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppColors.inkSoft,
                    ),
                    children: [
                      TextSpan(
                        text: (edge.label ?? edge.type ?? '相关').trim(),
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppColors.accentDeep,
                        ),
                      ),
                      TextSpan(text: ' · ${_edgePeerName(edge, nodeNames)}'),
                    ],
                  ),
                ),
              ),
            if (edges.isEmpty)
              for (final n in nodes.take(12))
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    n.name.isNotEmpty ? n.name : n.id,
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppColors.inkSoft,
                    ),
                  ),
                ),
          ],
        );
      case 'diagram':
        if (diagrams.isEmpty) {
          return const Text(
            '暂无图鉴',
            style: TextStyle(color: AppColors.inkFaint),
          );
        }
        final base = AppConfig.baseUrl.replaceAll(RegExp(r'/+$'), '');
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final d in diagrams.take(1))
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      d.title,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkSoft,
                      ),
                    ),
                    if ((d.summary ?? '').trim().isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        d.summary!.trim(),
                        style: const TextStyle(
                          fontSize: 13,
                          height: 1.5,
                          color: AppColors.inkFaint,
                        ),
                      ),
                    ],
                    const SizedBox(height: 8),
                    AspectRatio(
                      aspectRatio: 1.25,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: AppColors.surfaceSunken,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: SvgPicture.network(
                            '$base/content/diagrams/${d.id}/file',
                            fit: BoxFit.contain,
                            placeholderBuilder: (_) => const Center(
                              child: SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        );
      case 'refs':
      default:
        if (refs.isEmpty) {
          return const Text(
            '暂无参考经文',
            style: TextStyle(color: AppColors.inkFaint),
          );
        }
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final r in refs.take(16))
              _RefPill(
                label: formatGroupRefLabel(r),
                onTap: () => _openRefPreview(context, r),
              ),
          ],
        );
    }
  }

  String _tabLabel(String t) {
    switch (t) {
      case 'map':
        return '地点';
      case 'graph':
        return '关系';
      case 'diagram':
        return '图鉴';
      default:
        return '经节';
    }
  }

  String _edgePeerName(GraphEdge edge, Map<String, String> nodeNames) {
    final peer = edge.peerName?.trim();
    if (peer != null && peer.isNotEmpty) return peer;
    final peerId =
        edge.peerId ?? (edge.from == _entity.id ? edge.to : edge.from);
    return nodeNames[peerId] ?? peerId;
  }

  String _senseLabel(DictEntity e) {
    final d = e.disambiguation?.trim();
    if (d != null && d.isNotEmpty) {
      final head = RegExp(r'^[^（(]+').firstMatch(d)?.group(0)?.trim();
      if (head != null && head.isNotEmpty) {
        return head.length > 14 ? '${head.substring(0, 14)}…' : head;
      }
    }
    final type = entityTypeLabel(e.type);
    final label = type.isEmpty ? e.name : '${e.name}·$type';
    return label.length > 14 ? '${label.substring(0, 14)}…' : label;
  }

  Future<void> _openRefPreview(BuildContext context, String rawRef) async {
    final target = RelatedVerse(ref: rawRef, text: '').target;
    if (target == null) return;
    ref.read(badgeStatsRecorderProvider).recordDictEntity(_entity.id);
    await showInlineVersePreview(
      context,
      label: rawRef,
      bookId: target.book,
      chapter: target.chapter,
    );
  }

  void _askAssistant() {
    final refStr = _entity.refs.isNotEmpty ? _entity.refs.first : 'GEN.1.1';
    final type = switch (_entity.type) {
      'person' => '人物',
      'place' => '地点',
      _ => '词条',
    };
    ref.read(assistantSeedProvider.notifier).open(
      ref: refStr,
      question: '请介绍圣经中的$type「${_entity.name}」，包括其在经文中的主要角色与意义。',
    );
    Navigator.of(context).pop();
    ref.read(navIndexProvider.notifier).set(2);
  }

  void _openDictionary() {
    final router = GoRouter.of(context);
    Navigator.of(context).pop();
    router.push('/dictionary');
  }
}

/// 义项切换 chip，对齐 PWA `.dict-sense-chip`。
class _DictSenseChip extends StatelessWidget {
  const _DictSenseChip({
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
        side: BorderSide(
          color: active ? AppColors.accentDeep : AppColors.line,
        ),
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
              height: 1.3,
              color: active ? AppColors.accentDeep : AppColors.inkSoft,
              fontWeight: active ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
      ),
    );
  }
}

/// Tab pill，对齐 PWA `.entity-knowledge-tab`。
class _KnowledgeTabPill extends StatelessWidget {
  const _KnowledgeTabPill({
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
      color: Colors.transparent,
      shape: StadiumBorder(
        side: BorderSide(
          color: active ? AppColors.accent : AppColors.line,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
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

/// 经节 pill，对齐 PWA `.font-pill`。
class _RefPill extends StatelessWidget {
  const _RefPill({required this.label, required this.onTap});

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
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Text(
            label,
            style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
          ),
        ),
      ),
    );
  }
}

class _VersePreviewSheet extends ConsumerWidget {
  const _VersePreviewSheet({
    required this.label,
    required this.bookId,
    required this.chapter,
  });

  final String label;
  final String bookId;
  final int chapter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(chapterProvider((book: bookId, chapter: chapter)));
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 12 + bottom),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
              ),
              const ReaderSheetCloseButton(),
            ],
          ),
          const SizedBox(height: 10),
          Expanded(
            child: async.when(
              loading: () => const Center(
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              error: (_, __) => const Text(
                '无法加载经文',
                style: TextStyle(color: AppColors.inkFaint),
              ),
              data: (ch) {
                final verses = ch.verses.take(12).toList();
                if (verses.isEmpty) {
                  return const Text(
                    '暂无经文',
                    style: TextStyle(color: AppColors.inkFaint),
                  );
                }
                return ListView.separated(
                  itemCount: verses.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final v = verses[i];
                    return Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: '${v.verse} ',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.accentDeep,
                            ),
                          ),
                          TextSpan(
                            text: v.text,
                            style: const TextStyle(
                              fontSize: 14.5,
                              height: 1.55,
                              color: AppColors.inkSoft,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// 地点示意迷你地图（对齐 PWA GeoMiniMap 的离线投影示意，非精确地理）。
class _GeoMiniMapPreview extends StatelessWidget {
  const _GeoMiniMapPreview({required this.place});
  final GeoPlace place;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1.7,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xFFEDE6D8),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.line),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: CustomPaint(
            painter: _GeoMiniMapPainter(place: place),
            child: const SizedBox.expand(),
          ),
        ),
      ),
    );
  }
}

class _GeoMiniMapPainter extends CustomPainter {
  _GeoMiniMapPainter({required this.place});
  final GeoPlace place;

  @override
  void paint(Canvas canvas, Size size) {
    final land = Paint()..color = const Color(0xFFD9CFB8);
    final water = Paint()..color = const Color(0xFFC5D4C8);
    final coast = Paint()
      ..color = const Color(0xFF8A7B63)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    canvas.drawRect(Offset.zero & size, water);

    final coastPath = Path()
      ..moveTo(size.width * 0.02, size.height * 0.55)
      ..cubicTo(
        size.width * 0.12,
        size.height * 0.42,
        size.width * 0.22,
        size.height * 0.38,
        size.width * 0.34,
        size.height * 0.36,
      )
      ..cubicTo(
        size.width * 0.5,
        size.height * 0.32,
        size.width * 0.68,
        size.height * 0.34,
        size.width * 0.98,
        size.height * 0.4,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(coastPath, land);
    canvas.drawPath(coastPath, coast);

    final labels = [
      (0.14, 0.18, '地中海'),
      (0.78, 0.2, '美索不达米亚'),
      (0.2, 0.78, '埃及'),
      (0.52, 0.55, '犹地亚'),
    ];
    final labelStyle = TextStyle(
      color: AppColors.inkFaint.withValues(alpha: 0.85),
      fontSize: 10,
    );
    for (final (x, y, text) in labels) {
      final tp = TextPainter(
        text: TextSpan(text: text, style: labelStyle),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(
        canvas,
        Offset(size.width * x - tp.width / 2, size.height * y - tp.height / 2),
      );
    }

    final lat = place.latitude ?? 31.7;
    final lng = place.longitude ?? 35.2;
    const minLat = 27.5, maxLat = 36.5, minLng = 29.5, maxLng = 40.5;
    final px = ((lng - minLng) / (maxLng - minLng)).clamp(0.08, 0.92) * size.width;
    final py =
        ((maxLat - lat) / (maxLat - minLat)).clamp(0.1, 0.9) * size.height;

    final pin = Paint()..color = AppColors.accentDeep;
    canvas.drawCircle(Offset(px, py), 6, pin);
    canvas.drawCircle(
      Offset(px, py),
      6,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );

    final name = place.name.trim();
    if (name.isNotEmpty) {
      final tp = TextPainter(
        text: TextSpan(
          text: name,
          style: const TextStyle(
            color: AppColors.ink,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: size.width * 0.45);
      final labelX = (px + 10).clamp(4.0, size.width - tp.width - 4);
      final labelY = (py - tp.height - 8).clamp(4.0, size.height - tp.height - 4);
      final bg = RRect.fromRectAndRadius(
        Rect.fromLTWH(labelX - 4, labelY - 2, tp.width + 8, tp.height + 4),
        const Radius.circular(6),
      );
      canvas.drawRRect(bg, Paint()..color = Colors.white.withValues(alpha: 0.88));
      tp.paint(canvas, Offset(labelX, labelY));
    }
  }

  @override
  bool shouldRepaint(covariant _GeoMiniMapPainter oldDelegate) =>
      oldDelegate.place.id != place.id ||
      oldDelegate.place.latitude != place.latitude ||
      oldDelegate.place.longitude != place.longitude;
}

/// 关系图缩略：中心实体 + 周围节点与连线（对齐 PWA LocalRelationGraph 视觉层级）。
class _LocalRelationGraphPreview extends StatelessWidget {
  const _LocalRelationGraphPreview({
    required this.nodes,
    required this.edges,
    required this.centerId,
  });

  final List<GraphNode> nodes;
  final List<GraphEdge> edges;
  final String centerId;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1.35,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.surfaceSunken,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.line),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: CustomPaint(
            painter: _RelationGraphPainter(
              nodes: nodes,
              edges: edges,
              centerId: centerId,
            ),
            child: const SizedBox.expand(),
          ),
        ),
      ),
    );
  }
}

class _RelationGraphPainter extends CustomPainter {
  _RelationGraphPainter({
    required this.nodes,
    required this.edges,
    required this.centerId,
  });

  final List<GraphNode> nodes;
  final List<GraphEdge> edges;
  final String centerId;

  @override
  void paint(Canvas canvas, Size size) {
    if (nodes.isEmpty) return;
    final cx = size.width / 2;
    final cy = size.height / 2;
    final radius = math.min(size.width, size.height) * 0.34;

    GraphNode? center;
    for (final n in nodes) {
      if (n.id == centerId) {
        center = n;
        break;
      }
    }
    center ??= nodes.first;
    final others = nodes.where((n) => n.id != center!.id).toList();
    final positions = <String, Offset>{center.id: Offset(cx, cy)};
    for (var i = 0; i < others.length; i++) {
      final a = (i / math.max(others.length, 1)) * math.pi * 2 - math.pi / 2;
      positions[others[i].id] = Offset(
        cx + math.cos(a) * radius,
        cy + math.sin(a) * radius,
      );
    }

    final edgePaint = Paint()
      ..color = AppColors.accentDeep.withValues(alpha: 0.35)
      ..strokeWidth = 1.4
      ..style = PaintingStyle.stroke;
    for (final e in edges) {
      final a = positions[e.from];
      final b = positions[e.to];
      if (a == null || b == null) continue;
      canvas.drawLine(a, b, edgePaint);
    }

    void drawNode(GraphNode n, Offset p, {required bool isCenter}) {
      final r = isCenter ? 18.0 : 12.0;
      canvas.drawCircle(
        p,
        r,
        Paint()
          ..color = isCenter ? AppColors.accentDeep : AppColors.paper,
      );
      canvas.drawCircle(
        p,
        r,
        Paint()
          ..color = AppColors.accentDeep.withValues(alpha: isCenter ? 1 : 0.55)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
      final label = (n.name.isNotEmpty ? n.name : n.id).trim();
      final short = label.length > 5 ? '${label.substring(0, 5)}…' : label;
      final tp = TextPainter(
        text: TextSpan(
          text: short,
          style: TextStyle(
            color: isCenter ? Colors.white : AppColors.ink,
            fontSize: isCenter ? 10 : 9,
            fontWeight: FontWeight.w700,
          ),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        ellipsis: '…',
      )..layout(maxWidth: r * 2.2);
      tp.paint(canvas, Offset(p.dx - tp.width / 2, p.dy - tp.height / 2));
    }

    for (final n in others) {
      final p = positions[n.id];
      if (p != null) drawNode(n, p, isCenter: false);
    }
    drawNode(center, positions[center.id]!, isCenter: true);
  }

  @override
  bool shouldRepaint(covariant _RelationGraphPainter oldDelegate) =>
      oldDelegate.centerId != centerId ||
      oldDelegate.nodes.length != nodes.length ||
      oldDelegate.edges.length != edges.length;
}
