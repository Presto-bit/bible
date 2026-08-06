/// 经文想法：写想法 + 查看全部（对齐 PWA ThoughtWriteSheet 可见范围）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'thoughts_repository.dart';

Future<void> showWriteThoughtSheet(
  BuildContext context,
  WidgetRef ref, {
  required String refStr,
  required String refLabel,
}) async {
  final controller = TextEditingController();
  var visibility = ThoughtVisibility.public;

  final result = await showModalBottomSheet<({String body, ThoughtVisibility vis})>(
    context: context,
    isScrollControlled: true,
    isDismissible: true,
    enableDrag: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return StatefulBuilder(
        builder: (ctx, setLocal) {
          return Padding(
            padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 12,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: AppColors.line,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Text('写想法 · $refLabel',
                    style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        color: AppColors.ink)),
                const SizedBox(height: 10),
                Text(
                  visibilityHint(visibility),
                  style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  children: ThoughtVisibility.values.map((v) {
                    return ChoiceChip(
                      avatar: Icon(
                        switch (v) {
                          ThoughtVisibility.public => Icons.public,
                          ThoughtVisibility.friends => Icons.group_outlined,
                          ThoughtVisibility.private => Icons.lock_outline,
                        },
                        size: 16,
                      ),
                      label: Text(visibilityLabel(v)),
                      selected: visibility == v,
                      onSelected: (_) => setLocal(() => visibility = v),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  autofocus: true,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    hintText: '写下你的领受、疑问或祷告…',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerRight,
                  child: FilledButton(
                    onPressed: () => Navigator.pop(
                      ctx,
                      (body: controller.text, vis: visibility),
                    ),
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.accentDeep),
                    child: const Text('发布'),
                  ),
                ),
              ],
            ),
          );
        },
      );
    },
  );
  controller.dispose();
  if (result == null || result.body.trim().isEmpty) return;
  await ref.read(thoughtsRepoProvider).addThought(
        refStr,
        result.body.trim(),
        visibility: result.vis,
      );
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('想法已发布 · ${visibilityLabel(result.vis)}'),
        duration: const Duration(milliseconds: 1200),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

Future<void> showThoughtsListSheet(
  BuildContext context,
  WidgetRef ref, {
  required String refStr,
  required String refLabel,
  required String verseText,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.72,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      builder: (_, scroll) => Consumer(
        builder: (_, ref, __) {
          ref.watch(thoughtsRevisionProvider);
          final thoughts = ref.read(thoughtsRepoProvider).sortedForRef(refStr);
          return FutureBuilder<List<VerseThoughtData>>(
            future: thoughts,
            builder: (_, snap) {
              final rows = snap.data ?? const [];
              final repo = ref.read(thoughtsRepoProvider);
              return ListView(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                children: [
                  Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: AppColors.line,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.goldWash,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.line),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(refLabel,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                color: AppColors.accentDeep)),
                        const SizedBox(height: 8),
                        Text(verseText,
                            style: const TextStyle(
                                fontSize: 15,
                                height: 1.75,
                                color: AppColors.ink)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('${rows.length} 条想法',
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 14)),
                  const SizedBox(height: 10),
                  if (rows.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Center(
                        child: Text('还没有想法，来做第一个吧',
                            style: TextStyle(color: AppColors.inkFaint)),
                      ),
                    )
                  else
                    ...rows.map((t) {
                      final liked = repo.isLikedByMe(t);
                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceSunken,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.line),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(t.authorName,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 13)),
                                const SizedBox(width: 8),
                                Text(
                                  visibilityLabel(t.visibility),
                                  style: const TextStyle(
                                      fontSize: 11, color: AppColors.inkFaint),
                                ),
                                const Spacer(),
                                Text(
                                  _timeLabel(t.createdAtMs),
                                  style: const TextStyle(
                                      fontSize: 11,
                                      color: AppColors.inkFaint),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(t.body,
                                style: const TextStyle(
                                    fontSize: 14,
                                    height: 1.65,
                                    color: AppColors.ink)),
                            const SizedBox(height: 8),
                            InkWell(
                              onTap: () =>
                                  ref.read(thoughtsRepoProvider).toggleLike(t),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    liked
                                        ? Icons.favorite
                                        : Icons.favorite_border,
                                    size: 16,
                                    color: liked
                                        ? const Color(0xFFB1554A)
                                        : AppColors.inkFaint,
                                  ),
                                  const SizedBox(width: 4),
                                  Text('${t.likesCount}',
                                      style: const TextStyle(
                                          fontSize: 12,
                                          color: AppColors.inkFaint)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                ],
              );
            },
          );
        },
      ),
    ),
  );
}

String _timeLabel(int ms) {
  final d = DateTime.fromMillisecondsSinceEpoch(ms);
  final now = DateTime.now();
  if (d.year == now.year && d.month == now.month && d.day == now.day) {
    return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }
  return '${d.month}/${d.day}';
}
