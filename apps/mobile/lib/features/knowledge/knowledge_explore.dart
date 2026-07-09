/// 知识探索：地图 / 时间线 / 图鉴列表与详情。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/config.dart';
import '../../core/ref_label.dart';
import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';
import '../bible/content_repository.dart';
import '../bible/reader_screen.dart' show readerJumpProvider;

class KnowledgeHub extends ConsumerWidget {
  const KnowledgeHub({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const items = [
      ('地图故事', Icons.map_outlined, '/search/map'),
      ('历史时间线', Icons.timeline, '/search/timeline'),
      ('关系专题', Icons.hub_outlined, '/search/graph'),
      ('圣经图鉴', Icons.account_tree_outlined, '/search/diagrams'),
      ('圣经词典', Icons.menu_book_outlined, '/dictionary'),
    ];
    return SizedBox(
      height: 108,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) {
          final (label, icon, route) = items[i];
          return SizedBox(
            width: 132,
            child: PaperCard(
              onTap: () => context.push(route),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, color: AppColors.accentDeep, size: 22),
                  const Spacer(),
                  Text(label,
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 14)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class MapToursScreen extends ConsumerWidget {
  const MapToursScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(mapToursProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('地图故事')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (tours) => ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: tours.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) {
            final t = tours[i];
            return PaperCard(
              onTap: () => context.push('/search/map/${t.id}'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 16)),
                  if (t.subtitle != null) ...[
                    const SizedBox(height: 4),
                    Text(t.subtitle!,
                        style: const TextStyle(
                            fontSize: 13, color: AppColors.inkSoft)),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class TimelineToursScreen extends ConsumerWidget {
  const TimelineToursScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(timelineToursProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('历史时间线')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (tours) => ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: tours.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) {
            final t = tours[i];
            return PaperCard(
              onTap: () => context.push('/search/timeline/${t.id}'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 16)),
                  if (t.subtitle != null) ...[
                    const SizedBox(height: 4),
                    Text(t.subtitle!,
                        style: const TextStyle(
                            fontSize: 13, color: AppColors.inkSoft)),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class MapTourDetailScreen extends ConsumerWidget {
  const MapTourDetailScreen({super.key, required this.tourId});
  final String tourId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(mapTourProvider(tourId));
    return async.when(
      loading: () => const Scaffold(
          body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('$e'))),
      data: (t) => _StoryScaffold(
        title: t.title,
        description: t.description,
        steps: t.stops
            .map((s) => _StoryStep(
                  label: s.label,
                  ref: s.ref,
                  note: s.note,
                ))
            .toList(),
      ),
    );
  }
}

class TimelineTourDetailScreen extends ConsumerWidget {
  const TimelineTourDetailScreen({super.key, required this.tourId});
  final String tourId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(timelineTourProvider(tourId));
    return async.when(
      loading: () => const Scaffold(
          body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('$e'))),
      data: (t) => _StoryScaffold(
        title: t.title,
        description: t.description,
        steps: t.events
            .map((e) => _StoryStep(
                  label: e.label,
                  ref: e.ref,
                  note: e.era,
                ))
            .toList(),
      ),
    );
  }
}

class DiagramsScreen extends ConsumerWidget {
  const DiagramsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(diagramsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('圣经图鉴')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (items) => ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: items.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) {
            final d = items[i];
            return PaperCard(
              onTap: () => context.push('/search/diagrams/${d.id}'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(d.title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 16)),
                  if (d.summary != null) ...[
                    const SizedBox(height: 4),
                    Text(d.summary!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 13, color: AppColors.inkSoft)),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class GraphTopicsScreen extends ConsumerWidget {
  const GraphTopicsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(graphTopicsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('关系专题')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (topics) => ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: topics.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) {
            final t = topics[i];
            return PaperCard(
              onTap: () => context.push('/search/graph/${t.id}'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 16)),
                  if (t.subtitle != null) ...[
                    const SizedBox(height: 4),
                    Text(t.subtitle!,
                        style: const TextStyle(
                            fontSize: 13, color: AppColors.inkSoft)),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class GraphTopicDetailScreen extends ConsumerWidget {
  const GraphTopicDetailScreen({super.key, required this.topicId});
  final String topicId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(graphTopicProvider(topicId));
    return async.when(
      loading: () => const Scaffold(
          body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('$e'))),
      data: (data) {
        final topic = data.topic;
        final graph = data.graph;
        final nodeName = {for (final n in graph.nodes) n.id: n.name};
        return Scaffold(
          appBar: AppBar(title: Text(topic.title)),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (topic.subtitle != null)
                Text(topic.subtitle!,
                    style: const TextStyle(color: AppColors.inkSoft)),
              const SizedBox(height: 16),
              ...graph.edges.map((e) {
                final from = nodeName[e.from] ?? e.from;
                final to = nodeName[e.to] ?? e.to;
                final rel = e.label ?? e.type ?? '相关';
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: PaperCard(
                    child: Text('$from → $to · $rel',
                        style: const TextStyle(height: 1.45)),
                  ),
                );
              }),
            ],
          ),
        );
      },
    );
  }
}

class DiagramDetailScreen extends ConsumerWidget {
  const DiagramDetailScreen({super.key, required this.diagramId});
  final String diagramId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(diagramProvider(diagramId));
    final base = AppConfig.baseUrl.replaceAll(RegExp(r'/+$'), '');
    return async.when(
      loading: () => const Scaffold(
          body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('$e'))),
      data: (d) {
        final svgUrl = '$base/content/diagrams/${d.id}/file';
        return Scaffold(
          appBar: AppBar(title: Text(d.title)),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (d.summary != null)
                Text(d.summary!,
                    style: const TextStyle(height: 1.5, color: AppColors.inkSoft)),
              const SizedBox(height: 12),
              AspectRatio(
                aspectRatio: 1.2,
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.surfaceSunken,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: SvgPicture.network(svgUrl, fit: BoxFit.contain),
                ),
              ),
              const SizedBox(height: 16),
              ...d.hotspots.map((h) => ListTile(
                    title: Text(h.label),
                    subtitle: h.ref != null ? Text(formatGroupRefLabel(h.ref)) : null,
                    trailing: h.ref != null ? const Icon(Icons.chevron_right) : null,
                    onTap: h.ref == null
                        ? null
                        : () => _openRef(context, ref, h.ref!),
                  )),
            ],
          ),
        );
      },
    );
  }
}

class _StoryStep {
  _StoryStep({required this.label, this.ref, this.note});
  final String label;
  final String? ref;
  final String? note;
}

class _StoryScaffold extends ConsumerStatefulWidget {
  const _StoryScaffold({
    required this.title,
    this.description,
    required this.steps,
  });
  final String title;
  final String? description;
  final List<_StoryStep> steps;

  @override
  ConsumerState<_StoryScaffold> createState() => _StoryScaffoldState();
}

class _StoryScaffoldState extends ConsumerState<_StoryScaffold> {
  int _idx = 0;

  @override
  Widget build(BuildContext context) {
    final steps = widget.steps;
    if (steps.isEmpty) {
      return Scaffold(
          appBar: AppBar(title: Text(widget.title)),
          body: const Center(child: Text('暂无内容')));
    }
    final step = steps[_idx.clamp(0, steps.length - 1)];
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (widget.description != null) ...[
              Text(widget.description!,
                  style: const TextStyle(color: AppColors.inkSoft, height: 1.5)),
              const SizedBox(height: 16),
            ],
            Expanded(
              child: PaperCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('第 ${_idx + 1} / ${steps.length} 站',
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.inkFaint)),
                    const SizedBox(height: 8),
                    Text(step.label,
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w700)),
                    if (step.note != null) ...[
                      const SizedBox(height: 8),
                      Text(step.note!,
                          style: const TextStyle(color: AppColors.inkSoft)),
                    ],
                    if (step.ref != null) ...[
                      const Spacer(),
                      FilledButton(
                        onPressed: () => _openRef(context, ref, step.ref!),
                        style: FilledButton.styleFrom(
                            backgroundColor: AppColors.accentDeep),
                        child: Text('阅读 ${formatGroupRefLabel(step.ref)}'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                OutlinedButton(
                  onPressed: _idx > 0 ? () => setState(() => _idx--) : null,
                  child: const Text('上一站'),
                ),
                const Spacer(),
                OutlinedButton(
                  onPressed:
                      _idx < steps.length - 1 ? () => setState(() => _idx++) : null,
                  child: const Text('下一站'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

void _openRef(BuildContext context, WidgetRef ref, String refStr) {
  final m = RegExp(r'^([A-Za-z0-9]+)\s+(\d+)').firstMatch(refStr.trim());
  if (m == null) return;
  final book = m.group(1)!.toUpperCase();
  final chapter = int.tryParse(m.group(2)!);
  if (chapter == null) return;
  ref.read(readerJumpProvider.notifier).jump(book, chapter);
  ref.read(navIndexProvider.notifier).set(1);
  context.pop();
}
