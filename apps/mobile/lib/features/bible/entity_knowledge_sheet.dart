/// 词典知识卡半屏：对齐 PWA EntityKnowledgeSheet（摘要 / 经节 / 地点 / 关系列表）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart' show readerImmersiveProvider;
import '../../core/badge_stats.dart';
import '../../core/theme.dart';
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
      heightFactor: 0.56,
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
    final bottom = MediaQuery.paddingOf(context).bottom;
    final showSenses = widget.candidates.length > 1;
    final knowledgeAsync = ref.watch(entityKnowledgeProvider(_entity.id));

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 4, 16, 12 + bottom),
      child: knowledgeAsync.when(
        loading: () => _scaffold(
          typeLabel: typeLabel,
          showSenses: showSenses,
          summary: entitySummaryText(_entity),
          refs: _entity.refs,
          loading: true,
        ),
        error: (_, __) => _scaffold(
          typeLabel: typeLabel,
          showSenses: showSenses,
          summary: entitySummaryText(_entity),
          refs: _entity.refs,
          loading: false,
        ),
        data: (k) {
          final e = k.entity.id.isNotEmpty ? k.entity : _entity;
          final tabs = <String>['refs'];
          if (k.place != null) tabs.add('map');
          if (k.graph != null && (k.graph!.nodes.isNotEmpty)) {
            tabs.add('graph');
          }
          if (k.diagrams.isNotEmpty) tabs.add('diagrams');
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
            diagrams: k.diagrams,
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
    List<String> tabs = const ['refs'],
    String activeTab = 'refs',
    GeoPlace? place,
    GraphData? graph,
    List<DiagramItem> diagrams = const [],
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entityDisplayName(_entity),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (typeLabel.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      typeLabel,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.accentDeep,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            IconButton(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.close),
            ),
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
                ChoiceChip(
                  label: Text(
                    _senseLabel(c),
                    style: const TextStyle(fontSize: 12),
                  ),
                  selected: c.id == _entity.id,
                  onSelected: (_) {
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
        const SizedBox(height: 10),
        Text(
          summary,
          style: const TextStyle(
            fontSize: 14,
            height: 1.65,
            color: AppColors.inkSoft,
          ),
        ),
        if (tabs.length > 1) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              for (final t in tabs)
                ChoiceChip(
                  label: Text(_tabLabel(t)),
                  selected: activeTab == t,
                  onSelected: (_) => setState(() => _tab = t),
                ),
            ],
          ),
        ],
        const SizedBox(height: 10),
        Flexible(
          child: loading
              ? const SizedBox(
                  height: 120,
                  child: Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : SingleChildScrollView(
                  child: _tabBody(
                    tab: activeTab,
                    refs: refs,
                    place: place,
                    graph: graph,
                    diagrams: diagrams,
                  ),
                ),
        ),
      ],
    );
  }

  Widget _tabBody({
    required String tab,
    required List<String> refs,
    GeoPlace? place,
    GraphData? graph,
    List<DiagramItem> diagrams = const [],
  }) {
    switch (tab) {
      case 'map':
        if (place == null) {
          return const Text(
            '暂无地图资料',
            style: TextStyle(color: AppColors.inkFaint),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              place.name,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            if ((place.type ?? '').trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                _placeTypeLabel(place.type!),
                style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
              ),
            ],
            if ((place.modernName ?? '').trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                '今称：${place.modernName!.trim()}',
                style: const TextStyle(height: 1.55, color: AppColors.inkSoft),
              ),
            ],
            if (place.latitude != null && place.longitude != null) ...[
              const SizedBox(height: 8),
              Text(
                '坐标：${place.latitude!.toStringAsFixed(4)}, '
                '${place.longitude!.toStringAsFixed(4)}',
                style: const TextStyle(fontSize: 13, color: AppColors.inkFaint),
              ),
            ],
            if (place.refs.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final r in place.refs.take(12))
                    ActionChip(
                      label: Text(r, style: const TextStyle(fontSize: 12)),
                      backgroundColor: AppColors.goldWash,
                      side: BorderSide.none,
                      onPressed: () => _openRefPreview(context, r),
                    ),
                ],
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
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 优先渲染关系边，避免只有人名而看不出关系内容。
            for (final edge in edges.take(24))
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
              for (final n in nodes.take(24))
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
      case 'diagrams':
        if (diagrams.isEmpty) {
          return const Text(
            '暂无图鉴',
            style: TextStyle(color: AppColors.inkFaint),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final d in diagrams)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  d.title,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.inkSoft,
                  ),
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
              ActionChip(
                label: Text(r, style: const TextStyle(fontSize: 12)),
                backgroundColor: AppColors.goldWash,
                side: BorderSide.none,
                onPressed: () => _openRefPreview(context, r),
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
      case 'diagrams':
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

  String _placeTypeLabel(String type) {
    switch (type.toLowerCase()) {
      case 'city':
        return '城邑';
      case 'region':
        return '地区';
      case 'mountain':
        return '山地';
      case 'river':
        return '河流';
      default:
        return type;
    }
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
      padding: EdgeInsets.fromLTRB(16, 4, 16, 12 + bottom),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
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
