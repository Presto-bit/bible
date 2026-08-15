/// 词典词条半屏：对齐旧版 PWA dict-entry-sheet（简介 / 义项 / 参考经文预览）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/badge_stats.dart';
import '../../core/theme.dart';
import 'bible_repository.dart';
import 'content_repository.dart';
import 'dictionary_match.dart';

Future<void> showEntityKnowledgeSheet(
  BuildContext context, {
  required DictEntity entity,
  required String displayName,
  List<DictEntity> candidates = const [],
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _DictEntrySheet(
      entity: entity,
      displayName: displayName,
      candidates: candidates.isEmpty ? [entity] : candidates,
    ),
  );
}

class _DictEntrySheet extends ConsumerStatefulWidget {
  const _DictEntrySheet({
    required this.entity,
    required this.displayName,
    required this.candidates,
  });

  final DictEntity entity;
  final String displayName;
  final List<DictEntity> candidates;

  @override
  ConsumerState<_DictEntrySheet> createState() => _DictEntrySheetState();
}

class _DictEntrySheetState extends ConsumerState<_DictEntrySheet> {
  late DictEntity _entity = widget.entity;

  @override
  void didUpdateWidget(covariant _DictEntrySheet oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.entity.id != widget.entity.id) {
      _entity = widget.entity;
    }
  }

  @override
  Widget build(BuildContext context) {
    final typeLabel = entityTypeLabel(_entity.type);
    final bottom = MediaQuery.paddingOf(context).bottom;
    final showSenses = widget.candidates.length > 1;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottom),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
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
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.inkFaint,
                      ),
                    ),
                    for (final c in widget.candidates)
                      ChoiceChip(
                        label: Text(
                          _senseLabel(c),
                          style: const TextStyle(fontSize: 12),
                        ),
                        selected: c.id == _entity.id,
                        onSelected: (_) {
                          setState(() => _entity = c);
                          ref
                              .read(badgeStatsRecorderProvider)
                              .recordDictEntity(c.id);
                        },
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 10),
              Text(
                entitySummaryText(_entity),
                style: const TextStyle(
                  fontSize: 14,
                  height: 1.65,
                  color: AppColors.inkSoft,
                ),
              ),
              if (_entity.refs.isNotEmpty) ...[
                const SizedBox(height: 14),
                const Text(
                  '参考经文',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkFaint,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final r in _entity.refs.take(8))
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
          ),
        ),
      ),
    );
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
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _VersePreviewSheet(
        label: rawRef,
        bookId: target.book,
        chapter: target.chapter,
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
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              label,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 10),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              ),
              error: (_, __) => const Text(
                '无法加载经文',
                style: TextStyle(color: AppColors.inkFaint),
              ),
              data: (ch) {
                final verses = ch.verses.take(8).toList();
                if (verses.isEmpty) {
                  return const Text(
                    '暂无经文',
                    style: TextStyle(color: AppColors.inkFaint),
                  );
                }
                return ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(context).height * 0.45,
                  ),
                  child: ListView.separated(
                    shrinkWrap: true,
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
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
