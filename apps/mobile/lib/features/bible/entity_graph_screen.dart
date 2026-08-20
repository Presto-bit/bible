/// 实体关系图全屏页（对齐 PWA `/graph/:id`）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/ref_label.dart';
import '../../core/theme.dart';
import 'content_repository.dart';
import 'dictionary_match.dart';
import 'entity_knowledge_sheet.dart' show showInlineVersePreview;
import 'local_relation_graph.dart';

Future<void> showEntityGraphScreen(
  BuildContext context, {
  required DictEntity entity,
  GraphData? graph,
}) {
  return Navigator.of(context, rootNavigator: true).push<void>(
    MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (_) => EntityGraphScreen(entity: entity, graph: graph),
    ),
  );
}

class EntityGraphScreen extends ConsumerWidget {
  const EntityGraphScreen({super.key, required this.entity, this.graph});

  final DictEntity entity;
  final GraphData? graph;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (graph != null) {
      return _EntityGraphBody(entity: entity, graph: graph!);
    }
    final entityId = entity.id.isNotEmpty ? entity.id : entity.name;
    final async = ref.watch(entityKnowledgeProvider(entityId));
    return async.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(title: Text(entityDisplayName(entity))),
        body: Center(child: Text('$e')),
      ),
      data: (k) {
        final g = k.graph;
        if (g == null || g.edges.isEmpty) {
          return Scaffold(
            appBar: AppBar(title: Text(entityDisplayName(entity))),
            body: const Center(child: Text('暂无关系数据')),
          );
        }
        return _EntityGraphBody(
          entity: entity,
          graph: GraphData(
            center: g.center ?? entity,
            nodes: g.nodes,
            edges: g.edges,
          ),
        );
      },
    );
  }
}

class _EntityGraphBody extends StatelessWidget {
  const _EntityGraphBody({required this.entity, required this.graph});

  final DictEntity entity;
  final GraphData graph;

  void _openRef(BuildContext context, String ref) {
    final parts = ref.split('.');
    if (parts.length < 2) return;
    final ch = int.tryParse(parts[1]) ?? 1;
    showInlineVersePreview(
      context,
      label: formatGroupRefLabel(ref),
      bookId: parts[0],
      chapter: ch,
    );
  }

  @override
  Widget build(BuildContext context) {
    final edgeCount = graph.edges.length;
    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        title: Text('${entityDisplayName(entity)} · 关系'),
        backgroundColor: AppColors.paper,
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${entityTypeLabel(entity.type)}${edgeCount > 0 ? ' · $edgeCount 条关系' : ''}',
              style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: LocalRelationGraph(
                graph: graph,
                focusEntity: entity,
                variant: LocalRelationGraphVariant.fullscreen,
                onRefClick: (ref) => _openRef(context, ref),
                onNodeClick: (nodeId) {
                  if (nodeId == entity.id || nodeId == entity.name) return;
                  context.push('/dictionary/$nodeId');
                },
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () => context.push(
                '/dictionary/${Uri.encodeComponent(entity.id.isNotEmpty ? entity.id : entity.name)}',
              ),
              child: const Text('查看完整词条 ›'),
            ),
          ],
        ),
      ),
    );
  }
}
