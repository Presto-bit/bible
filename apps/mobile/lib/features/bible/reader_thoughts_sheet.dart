/// 经文想法：写想法 + 查看全部（对齐 PWA ThoughtWriteSheet 可见范围）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart' show prefsProvider;
import '../../core/theme.dart';
import 'thoughts_repository.dart';

const _draftPrefix = 'thought_draft_v1:';

Future<void> showWriteThoughtSheet(
  BuildContext context,
  WidgetRef ref, {
  required String refStr,
  required String refLabel,
  String? verseText,
}) async {
  final prefs = ref.read(prefsProvider);
  final draftKey = '$_draftPrefix$refStr';
  String initialBody = '';
  // 新建笔记始终默认公开；仅恢复同一节尚未完成的草稿选择。
  var visibility = ThoughtVisibility.public;
  try {
    final raw = prefs.getString(draftKey);
    if (raw != null && raw.trim().isNotEmpty) {
      final parts = raw.split('\u001e');
      if (parts.isNotEmpty) initialBody = parts[0];
      if (parts.length > 1) {
        visibility = switch (parts[1]) {
          'public' => ThoughtVisibility.public,
          'friends' => ThoughtVisibility.friends,
          'private' => ThoughtVisibility.private,
          _ => visibility,
        };
      }
    }
  } catch (_) {
    /* ignore */
  }

  final controller = TextEditingController(text: initialBody);
  var currentVis = visibility;
  final preview = verseText?.trim() ?? '';

  final result =
      await showModalBottomSheet<({String body, ThoughtVisibility vis})>(
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
              void persistDraft() {
                final body = controller.text;
                if (body.trim().isEmpty) {
                  prefs.remove(draftKey);
                } else {
                  prefs.setString(draftKey, '$body\u001e${currentVis.name}');
                }
              }

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
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '写笔记 · $refLabel',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                              color: AppColors.ink,
                            ),
                          ),
                        ),
                        PopupMenuButton<ThoughtVisibility>(
                          tooltip: '选择可见范围',
                          icon: Icon(switch (currentVis) {
                            ThoughtVisibility.public => Icons.public_outlined,
                            ThoughtVisibility.friends => Icons.group_outlined,
                            ThoughtVisibility.private => Icons.lock_outline,
                          }, color: AppColors.inkSoft),
                          onSelected: (v) {
                            setLocal(() => currentVis = v);
                            persistDraft();
                          },
                          itemBuilder: (_) => ThoughtVisibility.values
                              .map(
                                (v) => PopupMenuItem(
                                  value: v,
                                  child: Row(
                                    children: [
                                      Icon(
                                        switch (v) {
                                          ThoughtVisibility.public =>
                                            Icons.public_outlined,
                                          ThoughtVisibility.friends =>
                                            Icons.group_outlined,
                                          ThoughtVisibility.private =>
                                            Icons.lock_outline,
                                        },
                                        size: 18,
                                        color: v == currentVis
                                            ? AppColors.accentDeep
                                            : AppColors.inkSoft,
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(visibilityLabel(v)),
                                            Text(
                                              visibilityHint(v),
                                              style: const TextStyle(
                                                fontSize: 11,
                                                color: AppColors.inkFaint,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      if (v == currentVis)
                                        const Icon(
                                          Icons.check,
                                          size: 18,
                                          color: AppColors.accentDeep,
                                        ),
                                    ],
                                  ),
                                ),
                              )
                              .toList(),
                        ),
                      ],
                    ),
                    if (preview.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.goldWash,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.line),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '所选经文',
                              style: TextStyle(
                                fontSize: 11,
                                color: AppColors.inkFaint,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              preview,
                              style: const TextStyle(
                                fontSize: 14,
                                height: 1.55,
                                color: AppColors.ink,
                                fontFamily: 'Songti SC',
                                fontFamilyFallback: [
                                  'STSong',
                                  'Noto Serif SC',
                                  'serif',
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Text(
                      visibilityHint(currentVis),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.inkFaint,
                      ),
                    ),
                    const SizedBox(height: 10),
                    const SizedBox(height: 12),
                    TextField(
                      controller: controller,
                      autofocus: true,
                      maxLines: 5,
                      onChanged: (_) => persistDraft(),
                      decoration: const InputDecoration(
                        hintText: '写下你的领受、疑问或祷告…',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton(
                        onPressed: () => Navigator.pop(ctx, (
                          body: controller.text,
                          vis: currentVis,
                        )),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.accentDeep,
                        ),
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
  await prefs.remove(draftKey);
  await rememberVisibility(prefs, result.vis);
  await ref
      .read(thoughtsRepoProvider)
      .addThought(refStr, result.body.trim(), visibility: result.vis);
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('笔记已发布 · ${visibilityLabel(result.vis)}'),
        duration: const Duration(milliseconds: 1200),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

Future<void> _editThoughtSheet(
  BuildContext context,
  WidgetRef ref,
  VerseThoughtData thought,
) async {
  final ctl = TextEditingController(text: thought.body);
  final body = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        18,
        20,
        MediaQuery.viewInsetsOf(ctx).bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            '编辑想法',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 15,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: ctl,
            autofocus: true,
            minLines: 4,
            maxLines: 8,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              hintText: '写下你的领受…',
            ),
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.accentDeep,
              ),
              onPressed: () => Navigator.pop(ctx, ctl.text),
              child: const Text('保存'),
            ),
          ),
        ],
      ),
    ),
  );
  ctl.dispose();
  if (body == null || body.trim().isEmpty) return;
  await ref.read(thoughtsRepoProvider).updateThought(thought.id, body.trim());
}

Future<void> showThoughtHubSheet(
  BuildContext context,
  WidgetRef ref, {
  required String refStr,
  required String refLabel,
  required String verseText,
  String? bookId,
  int? chapter,
  int? verse,
  ThoughtHubReturn? returnHub,
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
      builder: (_, scroll) => _ThoughtHubSheetBody(
        scrollController: scroll,
        refStr: refStr,
        refLabel: refLabel,
        verseText: verseText,
        bookId: bookId,
        chapter: chapter,
        verse: verse,
        returnHub: returnHub,
      ),
    ),
  );
}

class ThoughtHubReturn {
  const ThoughtHubReturn({
    required this.refStr,
    required this.refLabel,
    required this.verseText,
    this.bookId,
    this.chapter,
    this.verse,
  });
  final String refStr;
  final String refLabel;
  final String verseText;
  final String? bookId;
  final int? chapter;
  final int? verse;
}

class _ThoughtHubSheetBody extends ConsumerWidget {
  const _ThoughtHubSheetBody({
    required this.scrollController,
    required this.refStr,
    required this.refLabel,
    required this.verseText,
    this.bookId,
    this.chapter,
    this.verse,
    this.returnHub,
  });

  final ScrollController scrollController;
  final String refStr;
  final String refLabel;
  final String verseText;
  final String? bookId;
  final int? chapter;
  final int? verse;
  final ThoughtHubReturn? returnHub;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(thoughtsRevisionProvider);
    final repo = ref.read(thoughtsRepoProvider);
    final rowsFuture = repo.sortedForRef(refStr);
    return FutureBuilder<List<VerseThoughtData>>(
      future: rowsFuture,
      builder: (context, snap) {
        final rows = snap.data ?? const [];
        final mineCount = repo.myThoughtsForRef(refStr).length;
        return ListView(
          controller: scrollController,
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
            Row(
              children: [
                const Expanded(
                  child: Text(
                    '本节想法',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      color: AppColors.ink,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: AppColors.inkFaint),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
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
                  Text(
                    refLabel,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: AppColors.accentDeep,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    verseText,
                    style: const TextStyle(
                      fontSize: 15,
                      height: 1.75,
                      color: AppColors.ink,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '共 ${rows.length} 条${mineCount > 0 ? ' · 你的 $mineCount 条' : ''}',
              style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.tonal(
                onPressed: () async {
                  Navigator.pop(context);
                  await showWriteThoughtSheet(
                    context,
                    ref,
                    refStr: refStr,
                    refLabel: refLabel,
                    verseText: verseText,
                  );
                  if (!context.mounted) return;
                  final hub = returnHub ??
                      ThoughtHubReturn(
                        refStr: refStr,
                        refLabel: refLabel,
                        verseText: verseText,
                        bookId: bookId,
                        chapter: chapter,
                        verse: verse,
                      );
                  await showThoughtHubSheet(
                    context,
                    ref,
                    refStr: hub.refStr,
                    refLabel: hub.refLabel,
                    verseText: hub.verseText,
                    bookId: hub.bookId,
                    chapter: hub.chapter,
                    verse: hub.verse,
                    returnHub: hub,
                  );
                },
                child: const Text('写想法'),
              ),
            ),
            const SizedBox(height: 12),
            if (rows.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: Text(
                    '还没有想法，来写第一条吧',
                    style: TextStyle(color: AppColors.inkFaint),
                  ),
                ),
              )
            else
              ...rows.map(
                (t) => _ThoughtListTile(
                  thought: t,
                  repo: repo,
                  onEdit: () async {
                    Navigator.pop(context);
                    await _editThoughtSheet(context, ref, t);
                    if (!context.mounted) return;
                    await showThoughtHubSheet(
                      context,
                      ref,
                      refStr: refStr,
                      refLabel: refLabel,
                      verseText: verseText,
                      bookId: bookId,
                      chapter: chapter,
                      verse: verse,
                      returnHub: returnHub,
                    );
                  },
                ),
              ),
          ],
        );
      },
    );
  }
}

class _ThoughtListTile extends ConsumerWidget {
  const _ThoughtListTile({
    required this.thought,
    required this.repo,
    required this.onEdit,
  });

  final VerseThoughtData thought;
  final ThoughtsRepository repo;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final liked = repo.isLikedByMe(thought);
    final mine = repo.isMine(thought);
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
              Text(
                '${thought.authorName}${mine ? ' · 我' : ''}',
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                visibilityLabel(thought.visibility),
                style: const TextStyle(fontSize: 11, color: AppColors.inkFaint),
              ),
              const Spacer(),
              Text(
                _timeLabel(thought.createdAtMs),
                style: const TextStyle(fontSize: 11, color: AppColors.inkFaint),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            thought.body,
            style: const TextStyle(fontSize: 14, height: 1.65, color: AppColors.ink),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              InkWell(
                onTap: () => ref.read(thoughtsRepoProvider).toggleLike(thought),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      liked ? Icons.favorite : Icons.favorite_border,
                      size: 16,
                      color: liked
                          ? const Color(0xFFB1554A)
                          : AppColors.inkFaint,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${thought.likesCount}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.inkFaint,
                      ),
                    ),
                  ],
                ),
              ),
              if (mine) ...[
                const Spacer(),
                TextButton(onPressed: onEdit, child: const Text('编辑')),
                TextButton(
                  onPressed: () async {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (dCtx) => AlertDialog(
                        title: const Text('删除想法'),
                        content: const Text('确定删除这条想法？同节划线也会一并去掉。'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(dCtx, false),
                            child: const Text('取消'),
                          ),
                          FilledButton(
                            onPressed: () => Navigator.pop(dCtx, true),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.accentDeep,
                            ),
                            child: const Text('删除'),
                          ),
                        ],
                      ),
                    );
                    if (ok == true) {
                      await ref
                          .read(thoughtsRepoProvider)
                          .deleteThoughtAndClearMark(thought.id);
                    }
                  },
                  child: const Text(
                    '删除',
                    style: TextStyle(color: Color(0xFFB1554A)),
                  ),
                ),
              ],
            ],
          ),
        ],
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
                        Text(
                          refLabel,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: AppColors.accentDeep,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          verseText,
                          style: const TextStyle(
                            fontSize: 15,
                            height: 1.75,
                            color: AppColors.ink,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton.tonal(
                      onPressed: () async {
                        await showWriteThoughtSheet(
                          context,
                          ref,
                          refStr: refStr,
                          refLabel: refLabel,
                          verseText: verseText,
                        );
                      },
                      child: const Text('写想法'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '${rows.length} 条想法',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (rows.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Center(
                        child: Text(
                          '还没有想法，来做第一个吧',
                          style: TextStyle(color: AppColors.inkFaint),
                        ),
                      ),
                    )
                  else
                    ...rows.map((t) {
                      final liked = repo.isLikedByMe(t);
                      final mine = repo.isMine(t);
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
                                Text(
                                  t.authorName,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  visibilityLabel(t.visibility),
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.inkFaint,
                                  ),
                                ),
                                const Spacer(),
                                Text(
                                  _timeLabel(t.createdAtMs),
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.inkFaint,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              t.body,
                              style: const TextStyle(
                                fontSize: 14,
                                height: 1.65,
                                color: AppColors.ink,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                InkWell(
                                  onTap: () => ref
                                      .read(thoughtsRepoProvider)
                                      .toggleLike(t),
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
                                      Text(
                                        '${t.likesCount}',
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: AppColors.inkFaint,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (mine) ...[
                                  const Spacer(),
                                  TextButton(
                                    onPressed: () =>
                                        _editThoughtSheet(context, ref, t),
                                    child: const Text('编辑'),
                                  ),
                                  TextButton(
                                    onPressed: () async {
                                      final ok = await showDialog<bool>(
                                        context: context,
                                        builder: (dCtx) => AlertDialog(
                                          title: const Text('删除想法？'),
                                          content: const Text(
                                            '删除后无法恢复。这条想法只属于你。',
                                          ),
                                          actions: [
                                            TextButton(
                                              onPressed: () =>
                                                  Navigator.pop(dCtx, false),
                                              child: const Text('取消'),
                                            ),
                                            FilledButton(
                                              onPressed: () =>
                                                  Navigator.pop(dCtx, true),
                                              style: FilledButton.styleFrom(
                                                backgroundColor:
                                                    AppColors.accentDeep,
                                              ),
                                              child: const Text('删除'),
                                            ),
                                          ],
                                        ),
                                      );
                                      if (ok == true) {
                                        await ref
                                            .read(thoughtsRepoProvider)
                                            .deleteThought(t.id);
                                      }
                                    },
                                    child: const Text(
                                      '删除',
                                      style: TextStyle(
                                        color: Color(0xFFB1554A),
                                      ),
                                    ),
                                  ),
                                ],
                              ],
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
