/// 圣经词典：人物/地名词条浏览与搜索；点经文引用跳转阅读。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/badge_stats.dart';
import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/theme.dart';
import 'content_repository.dart';
import 'reader_screen.dart' show readerJumpProvider;

class DictionaryScreen extends ConsumerStatefulWidget {
  const DictionaryScreen({super.key});

  @override
  ConsumerState<DictionaryScreen> createState() => _DictionaryScreenState();
}

class _DictionaryScreenState extends ConsumerState<DictionaryScreen> {
  String _term = '';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(dictionaryProvider(_term));
    return Scaffold(
      appBar: AppBar(title: const Text('圣经词典')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              decoration: InputDecoration(
                hintText: '搜索人物 / 地名 / 词条',
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: AppColors.surfaceSunken,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
              onChanged: (v) => setState(() => _term = v.trim()),
            ),
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                  child: Text('加载失败：$e',
                      style: const TextStyle(color: AppColors.inkFaint))),
              data: (items) => items.isEmpty
                  ? const Center(
                      child: Text('未找到相关词条',
                          style: TextStyle(color: AppColors.inkFaint)))
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      itemCount: items.length,
                      separatorBuilder: (_, i) => const SizedBox(height: 10),
                      itemBuilder: (_, i) => _EntityCard(entity: items[i]),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EntityCard extends ConsumerWidget {
  const _EntityCard({required this.entity});
  final DictEntity entity;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return InkWell(
      onTap: () =>
          ref.read(badgeStatsRecorderProvider).recordDictEntity(entity.name),
      borderRadius: BorderRadius.circular(14),
      child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(entity.name,
                  style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink)),
              const SizedBox(width: 8),
              if (entity.type.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.accentWash,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(entity.type,
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.accentDeep)),
                ),
            ],
          ),
          if (entity.summary.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(entity.summary,
                style: const TextStyle(color: AppColors.inkSoft, height: 1.6)),
          ],
          if (entity.refs.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: entity.refs.map((r) {
                final rv = RelatedVerse(ref: r, text: '');
                final t = rv.target;
                return ActionChip(
                  label: Text(r, style: const TextStyle(fontSize: 12)),
                  backgroundColor: AppColors.goldWash,
                  side: BorderSide.none,
                  onPressed: t == null
                      ? null
                      : () {
                          ref
                              .read(readerJumpProvider.notifier)
                              .jump(t.book, t.chapter);
                          ref.read(navIndexProvider.notifier).set(1);
                          Navigator.of(context).popUntil((r) => r.isFirst);
                        },
                );
              }).toList(),
            ),
          ],
        ],
      ),
    ),
    );
  }
}
