/// 「我的笔记」：本地优先列表 + 增删改；登录后自动云同步。
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/database/app_database.dart';
import '../../core/theme.dart';
import '../bible/reader_marking_models.dart';
import '../../core/mark_ref.dart' show parseMarkRef, markColorSemantics;
import '../bible/reader_screen.dart' show readerJumpProvider;
import '../../app/app_shell.dart' show navIndexProvider;
import 'notes_repository.dart';

class NotesScreen extends ConsumerStatefulWidget {
  const NotesScreen({super.key});

  @override
  ConsumerState<NotesScreen> createState() => _NotesScreenState();
}

class _NotesScreenState extends ConsumerState<NotesScreen> {
  bool _autoSynced = false;
  int _tab = 0; // 0=笔记 1=划线 2=书签
  String _query = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoSync());
  }

  Future<void> _autoSync() async {
    if (_autoSynced) return;
    if (!ref.read(sessionProvider).isSignedIn) return;
    _autoSynced = true;
    try {
      await ref.read(syncEngineProvider).syncOnce();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final notes = ref.watch(notesStreamProvider);
    final highlights = ref.watch(highlightMapProvider);
    final bookmarks = ref.watch(bookmarksProvider);
    final q = _query.trim().toLowerCase();

    return Scaffold(
      appBar: AppBar(
        title: const Text('经文记忆'),
      ),
      floatingActionButton: _tab == 0
          ? FloatingActionButton(
              backgroundColor: AppColors.accentDeep,
              onPressed: () => _editSheet(context, null),
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: TextField(
              decoration: InputDecoration(
                hintText: '搜索笔记、划线或书签…',
                prefixIcon: const Icon(Icons.search, size: 20),
                isDense: true,
                filled: true,
                fillColor: AppColors.surfaceSunken,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: _SegTabs(
              index: _tab,
              labels: [
                '笔记${notes.maybeWhen(data: (l) => l.isNotEmpty ? ' · ${l.length}' : '', orElse: () => '')}',
                '划线${highlights.maybeWhen(data: (m) => m.isNotEmpty ? ' · ${m.length}' : '', orElse: () => '')}',
                '书签${bookmarks.maybeWhen(data: (l) => l.isNotEmpty ? ' · ${l.length}' : '', orElse: () => '')}',
              ],
              onChanged: (i) => setState(() => _tab = i),
            ),
          ),
          Expanded(
            child: _tab == 0
                ? notes.when(
                    loading: () =>
                        const Center(child: CircularProgressIndicator()),
                    error: (e, _) => Center(child: Text('本地读取失败：$e')),
                    data: (list) {
                      final filtered = q.isEmpty
                          ? list
                          : list
                              .where((n) =>
                                  n.body.toLowerCase().contains(q) ||
                                  (n.ref ?? '').toLowerCase().contains(q))
                              .toList();
                      if (filtered.isEmpty) {
                        return _Empty(
                            text: q.isEmpty
                                ? '还没有笔记。点右下角 + 记录一段感动。'
                                : '没有匹配的笔记。');
                      }
                      return ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: filtered.length,
                        separatorBuilder: (_, i) => const SizedBox(height: 10),
                        itemBuilder: (_, i) => _NoteCard(
                          note: filtered[i],
                          onEdit: () => _editSheet(context, filtered[i]),
                          onOpenRef: (filtered[i].ref ?? '').isNotEmpty
                              ? () => _openRef(filtered[i].ref!)
                              : null,
                          onDelete: () =>
                              ref.read(notesRepoProvider).remove(filtered[i]),
                        ),
                      );
                    },
                  )
                : _tab == 1
                    ? highlights.when(
                        loading: () => const Center(
                            child: CircularProgressIndicator()),
                        error: (e, _) =>
                            Center(child: Text('读取失败：$e')),
                        data: (map) {
                          var entries = map.entries.toList()
                            ..sort((a, b) => a.key.compareTo(b.key));
                          if (q.isNotEmpty) {
                            entries = entries
                                .where((e) =>
                                    e.key.toLowerCase().contains(q))
                                .toList();
                          }
                          if (entries.isEmpty) {
                            return _Empty(
                                text: q.isEmpty
                                    ? '还没有划线。阅读时长按经文选色即可标记。'
                                    : '没有匹配的划线。');
                          }
                          return ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: entries.length,
                            separatorBuilder: (_, i) =>
                                const SizedBox(height: 10),
                            itemBuilder: (_, i) {
                              final e = entries[i];
                              return _HighlightCard(
                                refStr: e.key,
                                color: e.value.color,
                                onOpen: () => _openRef(e.key),
                              );
                            },
                          );
                        },
                      )
                    : bookmarks.when(
                    loading: () =>
                        const Center(child: CircularProgressIndicator()),
                    error: (e, _) => Center(child: Text('读取失败：$e')),
                    data: (list) {
                      final filtered = q.isEmpty
                          ? list
                          : list
                              .where((b) => b.ref.toLowerCase().contains(q))
                              .toList();
                      if (filtered.isEmpty) {
                        return _Empty(
                            text: q.isEmpty
                                ? '还没有书签。阅读时点「书签」即可加入。'
                                : '没有匹配的书签。');
                      }
                      return ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: filtered.length,
                        separatorBuilder: (_, i) => const SizedBox(height: 10),
                        itemBuilder: (_, i) => _BookmarkCard(
                          refStr: filtered[i].ref,
                          onOpen: () => _openRef(filtered[i].ref),
                          onRemove: () => ref
                              .read(markingsRepoProvider)
                              .toggleBookmark(filtered[i].ref),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  void _openRef(String refStr) {
    final parsed = parseMarkRef(refStr);
    if (parsed == null) return;
    ref.read(readerJumpProvider.notifier).jump(parsed.bookId, parsed.chapter);
    ref.read(navIndexProvider.notifier).set(1);
  }

  Future<void> _editSheet(BuildContext context, Note? note) async {
    final ctl = TextEditingController(text: note?.body ?? '');
    final refCtl = TextEditingController(text: note?.ref ?? '');
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(note == null ? '新建笔记' : '编辑笔记',
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 14),
            TextField(
              controller: refCtl,
              decoration: const InputDecoration(
                labelText: '关联经文（可选，如 JHN.3.16）',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctl,
              minLines: 3,
              maxLines: 6,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: '笔记内容',
                border: OutlineInputBorder(),
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.accentDeep),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('保存'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final body = ctl.text.trim();
    if (body.isEmpty) return;
    final repo = ref.read(notesRepoProvider);
    final refText = refCtl.text.trim();
    if (note == null) {
      await repo.create(body: body, ref: refText.isEmpty ? null : refText);
    } else {
      await repo.edit(note, body: body);
    }
  }
}

class _NoteCard extends StatelessWidget {
  const _NoteCard({
    required this.note,
    required this.onEdit,
    required this.onDelete,
    this.onOpenRef,
  });
  final Note note;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback? onOpenRef;

  @override
  Widget build(BuildContext context) {
    final tags = (jsonDecode(note.tagsJson) as List).cast<String>();
    return Dismissible(
      key: ValueKey(note.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        decoration: BoxDecoration(
          color: const Color(0xFFE9D6D2),
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Icon(Icons.delete_outline, color: Color(0xFFB1554A)),
      ),
      onDismissed: (_) => onDelete(),
      child: InkWell(
        onTap: onEdit,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if ((note.ref ?? '').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(note.ref!,
                      style: const TextStyle(
                          color: AppColors.gold,
                          fontSize: 12,
                          fontWeight: FontWeight.w600)),
                ),
              Text(note.body,
                  style: const TextStyle(
                      fontSize: 15, height: 1.6, color: AppColors.ink)),
              if (tags.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Wrap(
                    spacing: 6,
                    children: tags
                        .map((t) => Text('#$t',
                            style: const TextStyle(
                                color: AppColors.inkFaint, fontSize: 12)))
                        .toList(),
                  ),
                ),
              if (onOpenRef != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: TextButton(
                    onPressed: onOpenRef,
                    child: const Text('跳转经文'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({this.text});
  final String? text;
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          text ?? '还没有笔记。\n点右下角 + 记录一段感动，离线也能写，联网一键同步。',
          textAlign: TextAlign.center,
          style: const TextStyle(color: AppColors.inkFaint, height: 1.7),
        ),
      ),
    );
  }
}

class _SegTabs extends StatelessWidget {
  const _SegTabs({
    required this.index,
    required this.labels,
    required this.onChanged,
  });
  final int index;
  final List<String> labels;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceSunken,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: List.generate(labels.length, (i) {
          final active = i == index;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(i),
              child: Container(
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: active ? AppColors.surface : Colors.transparent,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text(
                  labels[i],
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                    color: active ? AppColors.accentDeep : AppColors.inkSoft,
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _HighlightCard extends StatelessWidget {
  const _HighlightCard({
    required this.refStr,
    required this.color,
    required this.onOpen,
  });
  final String refStr;
  final String color;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              color: chipColor(color),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(markColorSemantics[color] ?? '划线',
                    style: const TextStyle(
                        fontSize: 11, color: AppColors.inkFaint)),
                Text(refStr,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, color: AppColors.ink)),
              ],
            ),
          ),
          TextButton(onPressed: onOpen, child: const Text('跳转')),
        ],
      ),
    );
  }
}

class _BookmarkCard extends StatelessWidget {
  const _BookmarkCard({
    required this.refStr,
    required this.onOpen,
    required this.onRemove,
  });
  final String refStr;
  final VoidCallback onOpen;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final label = refStr.replaceAll('.', ' ');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          const Icon(Icons.star, color: AppColors.gold, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(label,
                style: const TextStyle(
                    fontWeight: FontWeight.w600, color: AppColors.ink)),
          ),
          TextButton(onPressed: onOpen, child: const Text('阅读')),
          IconButton(
            tooltip: '移除',
            icon: const Icon(Icons.close, size: 18, color: AppColors.inkFaint),
            onPressed: onRemove,
          ),
        ],
      ),
    );
  }
}
