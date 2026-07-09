/// 读经工具半屏：串珠 / Strong 原文（对齐 Web ReaderToolsSheet）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/badge_stats.dart';
import '../../core/theme.dart';
import '../bible/bible_repository.dart';
import '../bible/content_repository.dart';
import '../bible/reader_screen.dart' show readerJumpProvider;

class ReaderToolsSheet extends ConsumerStatefulWidget {
  const ReaderToolsSheet({
    super.key,
    required this.refParam,
    required this.refLabel,
    this.sourceText,
    this.initialTab = 0,
  });

  final String refParam;
  final String refLabel;
  final String? sourceText;
  final int initialTab;

  @override
  ConsumerState<ReaderToolsSheet> createState() => _ReaderToolsSheetState();
}

class _ReaderToolsSheetState extends ConsumerState<ReaderToolsSheet> {
  late int _tab;

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab;
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () => Navigator.pop(context),
                ),
                Expanded(
                  child: Text(
                    widget.refLabel,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            Row(
              children: [
                _tabChip('相关经文', 0),
                const SizedBox(width: 8),
                _tabChip('Strong', 1),
                const SizedBox(width: 8),
                _tabChip('资源', 2),
              ],
            ),
            const SizedBox(height: 8),
            if (widget.sourceText != null && widget.sourceText!.isNotEmpty)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSunken,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  widget.sourceText!,
                  style: const TextStyle(fontSize: 14, height: 1.55),
                ),
              ),
            Flexible(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _tabChip(String label, int idx) {
    final active = _tab == idx;
    return ChoiceChip(
      label: Text(label),
      selected: active,
      onSelected: (_) => setState(() => _tab = idx),
      selectedColor: AppColors.accentWash,
    );
  }

  Widget _body() {
    switch (_tab) {
      case 0:
        return _CrossrefsBody(refParam: widget.refParam, onOpenRef: _openRef);
      case 1:
        return _StrongsBody(refParam: widget.refParam);
      default:
        return _GuideBody(refParam: widget.refParam);
    }
  }

  void _openRef(String targetRef) {
    final m = RegExp(r'^([A-Za-z0-9]+)\s+(\d+)').firstMatch(targetRef.trim());
    if (m == null) return;
    final book = m.group(1)!.toUpperCase();
    final chapter = int.tryParse(m.group(2)!);
    if (chapter == null) return;
    Navigator.pop(context);
    ref.read(readerJumpProvider.notifier).jump(book, chapter);
    ref.read(navIndexProvider.notifier).set(1);
  }
}

class _CrossrefsBody extends ConsumerWidget {
  const _CrossrefsBody({required this.refParam, required this.onOpenRef});
  final String refParam;
  final void Function(String ref) onOpenRef;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(crossrefsProvider(refParam));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Text('加载失败：$e'),
      data: (cross) {
        ref.read(badgeStatsRecorderProvider).recordCrossrefOpen();
        if (cross.related.isEmpty) {
          return const Text('暂无相关经文', style: TextStyle(color: AppColors.inkFaint));
        }
        return ListView.separated(
          shrinkWrap: true,
          itemCount: cross.related.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (_, i) {
            final r = cross.related[i];
            return ListTile(
              title: Text(r.ref, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(r.text, maxLines: 3, overflow: TextOverflow.ellipsis),
              onTap: () => onOpenRef(r.ref),
            );
          },
        );
      },
    );
  }
}

class _StrongsBody extends ConsumerWidget {
  const _StrongsBody({required this.refParam});
  final String refParam;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(strongsProvider(refParam));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Text('加载失败：$e'),
      data: (words) {
        ref.read(badgeStatsRecorderProvider).recordStrongsOpen();
        if (words.isEmpty) {
          return const Text('暂无 Strong 数据', style: TextStyle(color: AppColors.inkFaint));
        }
        return ListView.separated(
          shrinkWrap: true,
          itemCount: words.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (_, i) {
            final w = words[i];
            return ListTile(
              title: Text('${w.strongs ?? ''} · ${w.word ?? ''}'),
              subtitle: Text(
                [if ((w.lemma ?? '').isNotEmpty) w.lemma!, if ((w.gloss ?? '').isNotEmpty) w.gloss!]
                    .join(' · '),
              ),
            );
          },
        );
      },
    );
  }
}

class _GuideBody extends ConsumerWidget {
  const _GuideBody({required this.refParam});
  final String refParam;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(guideProvider(refParam));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Text('加载失败：$e'),
      data: (g) {
        if (g.cards.isEmpty && g.passage.isEmpty) {
          return const Text('暂无资源', style: TextStyle(color: AppColors.inkFaint));
        }
        return ListView(
          shrinkWrap: true,
          children: [
            if (g.passage.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(g.passage, style: const TextStyle(height: 1.55)),
              ),
            ...g.cards.map(
              (r) => ListTile(
                title: Text(r.title),
                subtitle: r.snippet.isNotEmpty ? Text(r.snippet) : null,
              ),
            ),
          ],
        );
      },
    );
  }
}

Future<void> showReaderToolsSheet(
  BuildContext context, {
  required String refParam,
  required String refLabel,
  String? sourceText,
  int initialTab = 0,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.72,
      maxChildSize: 0.92,
      builder: (_, __) => ReaderToolsSheet(
        refParam: refParam,
        refLabel: refLabel,
        sourceText: sourceText,
        initialTab: initialTab,
      ),
    ),
  );
}
