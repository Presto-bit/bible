/// 「我的想法」：想法 / 划线（无书签、无笔记）。
/// 想法：书卷分组下钻 + 新建自定义；划线：色点筛选。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/mark_ref.dart' show parseMarkRef;
import '../../core/ref_label.dart' show bookIdToChineseName, formatGroupRefLabel;
import '../../core/sync/sync_controller.dart';
import '../../core/theme.dart';
import '../../app/app_shell.dart' show navIndexProvider;
import '../bible/markings_repository.dart';
import '../bible/reader_marking_models.dart'
    show chipColor, highlightColorKeys, markColorSemantics;
import '../bible/reader_screen.dart' show readerJumpProvider;
import '../bible/thoughts_repository.dart';
import '../social/share_to_social_sheet.dart';

/// 无经文关联的自定义想法。
const freeThoughtRef = 'FREE';

class NotesScreen extends ConsumerStatefulWidget {
  const NotesScreen({super.key});

  @override
  ConsumerState<NotesScreen> createState() => _NotesScreenState();
}

class _NotesScreenState extends ConsumerState<NotesScreen> {
  bool _autoSynced = false;
  int _tab = 0; // 0=想法 1=划线
  String _query = '';
  String _colorFilter = 'all';
  String? _thoughtGroup;
  VerseThoughtData? _thoughtDetail;

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
      await ref.read(syncControllerProvider.notifier).runSync();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final highlights = ref.watch(highlightMapProvider);
    final thoughts = ref.watch(myThoughtsProvider);
    final q = _query.trim().toLowerCase();

    return Scaffold(
      appBar: AppBar(
        title: const Text('我的想法'),
        leading: _thoughtDetail != null || _thoughtGroup != null
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () {
                  setState(() {
                    if (_thoughtDetail != null) {
                      _thoughtDetail = null;
                    } else {
                      _thoughtGroup = null;
                    }
                  });
                },
              )
            : null,
      ),
      floatingActionButton: _tab == 0 &&
              _thoughtDetail == null &&
              _thoughtGroup == null
          ? FloatingActionButton(
              backgroundColor: AppColors.accentDeep,
              onPressed: () => _createThoughtSheet(context),
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: TextField(
              decoration: InputDecoration(
                hintText: '搜索想法或划线…',
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
                '想法${thoughts.isNotEmpty ? ' · ${thoughts.length}' : ''}',
                '划线${highlights.maybeWhen(data: (m) => m.isNotEmpty ? ' · ${m.length}' : '', orElse: () => '')}',
              ],
              onChanged: (i) => setState(() {
                _tab = i;
                _thoughtGroup = null;
                _thoughtDetail = null;
              }),
            ),
          ),
          if (_tab == 1)
            _ColorFilterBar(
              selected: _colorFilter,
              onChanged: (c) => setState(() => _colorFilter = c),
            ),
          Expanded(
            child: _tab == 0
                ? _buildThoughts(thoughts, q)
                : highlights.when(
                    loading: () =>
                        const Center(child: CircularProgressIndicator()),
                    error: (e, _) => Center(child: Text('读取失败：$e')),
                    data: (map) {
                      var entries = map.entries.toList()
                        ..sort((a, b) => a.key.compareTo(b.key));
                      if (_colorFilter != 'all') {
                        entries = entries
                            .where((e) => e.value.color == _colorFilter)
                            .toList();
                      }
                      if (q.isNotEmpty) {
                        entries = entries
                            .where((e) => e.key.toLowerCase().contains(q))
                            .toList();
                      }
                      if (entries.isEmpty) {
                        return _Empty(
                            text: q.isEmpty && _colorFilter == 'all'
                                ? '还没有划线。阅读时选中经文选色即可标记。'
                                : '没有匹配的划线。');
                      }
                      return ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: entries.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: 10),
                        itemBuilder: (_, i) {
                          final e = entries[i];
                          return _HighlightCard(
                            refStr: e.key,
                            color: e.value.color,
                            onOpen: () => _openRef(e.key),
                            onShare: () => showShareToSocialSheet(
                              context,
                              ref,
                              refText: e.key,
                              refLabel: formatGroupRefLabel(e.key),
                              kind: 'verse',
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

  Widget _buildThoughts(List<VerseThoughtData> thoughts, String q) {
    final filtered = q.isEmpty
        ? thoughts
        : thoughts
            .where((t) =>
                t.body.toLowerCase().contains(q) ||
                t.ref.toLowerCase().contains(q))
            .toList();

    if (_thoughtDetail != null) {
      final t = _thoughtDetail!;
      final isFree = t.ref == freeThoughtRef || t.ref.isEmpty;
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(isFree ? '随想' : formatGroupRefLabel(t.ref),
                style: const TextStyle(
                    color: AppColors.gold,
                    fontWeight: FontWeight.w600,
                    fontSize: 13)),
            const SizedBox(height: 12),
            Expanded(
              child: SingleChildScrollView(
                child: Text(t.body,
                    style: const TextStyle(
                        fontSize: 15, height: 1.7, color: AppColors.ink)),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                if (!isFree)
                  TextButton(
                      onPressed: () => _openRef(t.ref),
                      child: const Text('跳转经文')),
                TextButton(
                  onPressed: () => showShareToSocialSheet(
                    context,
                    ref,
                    refText: t.ref,
                    refLabel: isFree ? '随想' : formatGroupRefLabel(t.ref),
                    body: t.body,
                    kind: 'thought',
                  ),
                  child: const Text('分享'),
                ),
                TextButton(
                  onPressed: () async {
                    await ref.read(thoughtsRepoProvider).deleteThought(t.id);
                    setState(() => _thoughtDetail = null);
                  },
                  style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFFB1554A)),
                  child: const Text('删除'),
                ),
              ],
            ),
          ],
        ),
      );
    }

    if (_thoughtGroup != null) {
      final items =
          filtered.where((t) => _bookId(t.ref) == _thoughtGroup).toList();
      if (items.isEmpty) {
        return const _Empty(text: '该分组暂无想法。');
      }
      return ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final t = items[i];
          final preview = t.body.trim();
          final isFree = t.ref == freeThoughtRef || t.ref.isEmpty;
          return InkWell(
            onTap: () => setState(() => _thoughtDetail = t),
            borderRadius: BorderRadius.circular(16),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(isFree ? '随想' : formatGroupRefLabel(t.ref),
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.inkFaint)),
                  const SizedBox(height: 4),
                  Text(
                    preview.isEmpty
                        ? '（空）'
                        : (preview.length > 40
                            ? '${preview.substring(0, 40)}…'
                            : preview.split('\n').first),
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  if (preview.length > 40) ...[
                    const SizedBox(height: 4),
                    Text(
                      preview.length > 80
                          ? '${preview.substring(0, 80)}…'
                          : preview,
                      style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.inkFaint,
                          height: 1.4),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      );
    }

    if (filtered.isEmpty) {
      return _Empty(
          text: q.isEmpty
              ? '还没有想法。可点右下角 + 新建，或在小爱回答里存想法。'
              : '没有匹配的想法。');
    }

    final groups = <String, List<VerseThoughtData>>{};
    for (final t in filtered) {
      final bid = _bookId(t.ref);
      (groups[bid] ??= []).add(t);
    }
    final keys = groups.keys.toList()
      ..sort((a, b) {
        if (a == 'FREE') return -1;
        if (b == 'FREE') return 1;
        return _bookLabel(a).compareTo(_bookLabel(b));
      });

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: keys.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final bid = keys[i];
        final items = groups[bid]!;
        final preview = items.first.body.trim();
        return InkWell(
          onTap: () => setState(() => _thoughtGroup = bid),
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.line),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_bookLabel(bid),
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 15)),
                      const SizedBox(height: 4),
                      Text(
                        preview.isEmpty
                            ? '查看想法'
                            : (preview.length > 28
                                ? '${preview.substring(0, 28)}…'
                                : preview),
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.inkFaint),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                Text('${items.length} ›',
                    style: const TextStyle(
                        color: AppColors.inkFaint, fontSize: 13)),
              ],
            ),
          ),
        );
      },
    );
  }

  String _bookId(String ref) {
    if (ref.isEmpty || ref == freeThoughtRef) return 'FREE';
    final p = ref.split('.');
    return p.isEmpty ? 'FREE' : p.first.toUpperCase();
  }

  String _bookLabel(String bookId) {
    if (bookId == 'FREE' || bookId == 'OTHER') return '随想';
    return bookIdToChineseName(bookId);
  }

  void _openRef(String refStr) {
    final parsed = parseMarkRef(refStr);
    if (parsed == null) return;
    ref.read(readerJumpProvider.notifier).jump(parsed.bookId, parsed.chapter);
    ref.read(navIndexProvider.notifier).set(1);
    Navigator.of(context).pop();
  }

  Future<void> _createThoughtSheet(BuildContext context) async {
    final ctl = TextEditingController();
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
            const Text('新建想法',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 14),
            TextField(
              controller: ctl,
              minLines: 4,
              maxLines: 8,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: '写下你的领受、疑问或祷告…',
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
    await ref
        .read(thoughtsRepoProvider)
        .addThought(freeThoughtRef, body, shared: false);
  }
}

class _ColorFilterBar extends StatelessWidget {
  const _ColorFilterBar({required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Row(
        children: [
          _chip(
            label: '全部',
            active: selected == 'all',
            onTap: () => onChanged('all'),
          ),
          const SizedBox(width: 8),
          ...highlightColorKeys.map((c) {
            final active = selected == c;
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: () => onChanged(active ? 'all' : c),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                  decoration: BoxDecoration(
                    color: active ? AppColors.accentWash : Colors.transparent,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: active ? AppColors.accent : AppColors.line,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 14,
                        height: 14,
                        decoration: BoxDecoration(
                          color: chipColor(c),
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.line),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(markColorSemantics[c] ?? c,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight:
                                active ? FontWeight.w700 : FontWeight.w500,
                            color: active
                                ? AppColors.accentDeep
                                : AppColors.inkSoft,
                          )),
                    ],
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _chip({
    required String label,
    required bool active,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: active ? AppColors.accentWash : AppColors.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: active ? AppColors.accent : AppColors.line,
          ),
        ),
        child: Text(label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              color: active ? AppColors.accentDeep : AppColors.inkSoft,
            )),
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
      padding: const EdgeInsets.all(3),
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
                    fontSize: 13,
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

class _Empty extends StatelessWidget {
  const _Empty({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.inkFaint, height: 1.5)),
      ),
    );
  }
}

class _HighlightCard extends StatelessWidget {
  const _HighlightCard({
    required this.refStr,
    required this.color,
    required this.onOpen,
    this.onShare,
  });
  final String refStr;
  final String color;
  final VoidCallback onOpen;
  final VoidCallback? onShare;

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
                Text(formatGroupRefLabel(refStr),
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, color: AppColors.ink)),
              ],
            ),
          ),
          TextButton(onPressed: onOpen, child: const Text('跳转')),
          if (onShare != null)
            TextButton(onPressed: onShare, child: const Text('分享')),
        ],
      ),
    );
  }
}
