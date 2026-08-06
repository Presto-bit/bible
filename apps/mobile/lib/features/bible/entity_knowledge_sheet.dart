/// 词典词条半屏：对齐 PWA EntityKnowledgeSheet 的本地简介 + 经文引用。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/badge_stats.dart';
import '../../core/theme.dart';
import 'content_repository.dart';
import 'dictionary_match.dart';
import 'reader_screen.dart' show readerJumpProvider;

Future<void> showEntityKnowledgeSheet(
  BuildContext context, {
  required DictEntity entity,
  required String displayName,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _EntitySheet(entity: entity, displayName: displayName),
  );
}

class _EntitySheet extends ConsumerWidget {
  const _EntitySheet({required this.entity, required this.displayName});
  final DictEntity entity;
  final String displayName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final typeLabel = entityTypeLabel(entity.type);
    final bottom = MediaQuery.paddingOf(context).bottom;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottom),
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
                        displayName,
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
            const SizedBox(height: 10),
            Text(
              entitySummaryText(entity),
              style: const TextStyle(
                fontSize: 14,
                height: 1.65,
                color: AppColors.inkSoft,
              ),
            ),
            if (entity.refs.isNotEmpty) ...[
              const SizedBox(height: 14),
              const Text(
                '经文引用',
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
                  for (final r in entity.refs.take(12))
                    ActionChip(
                      label: Text(r, style: const TextStyle(fontSize: 12)),
                      backgroundColor: AppColors.goldWash,
                      side: BorderSide.none,
                      onPressed: () {
                        final t = RelatedVerse(ref: r, text: '').target;
                        if (t == null) return;
                        ref.read(badgeStatsRecorderProvider)
                            .recordDictEntity(entity.id);
                        ref
                            .read(readerJumpProvider.notifier)
                            .jump(t.book, t.chapter);
                        ref.read(navIndexProvider.notifier).set(1);
                        Navigator.pop(context);
                      },
                    ),
                ],
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
