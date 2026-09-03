/// 书架列表（Android 原生；对齐 PWA /shelf）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'shelf_progress.dart';
import 'shelf_repository.dart';

final shelfListProvider = FutureProvider.autoDispose<ShelfListData>((ref) async {
  return ref.watch(shelfRepoProvider).listPlatform();
});

class ShelfScreen extends ConsumerWidget {
  const ShelfScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(shelfListProvider);
    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => context.pop(),
        ),
        title: const Text('书架', style: AppTypography.title),
      ),
      body: async.when(
        loading: () => const Center(child: Text('加载中…', style: AppTypography.meta)),
        error: (_, __) => const Center(child: Text('暂时无法加载书架', style: AppTypography.meta)),
        data: (data) {
          if (data.items.isEmpty) {
            return const Center(child: Text('暂无书目，稍后再来看看。', style: AppTypography.meta));
          }
          final grouped = _groupBooks(data);
          return RefreshIndicator(
            onRefresh: () async {
              await ref.read(shelfRepoProvider).listPlatform(force: true);
              ref.invalidate(shelfListProvider);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
              const Text(
                '安静阅读，在文字里相遇。',
                style: AppTypography.secondary,
              ),
              const SizedBox(height: 20),
              for (final row in grouped) ...[
                Text(row.group.title, style: AppTypography.meta.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 10),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: 0.72,
                  ),
                  itemCount: row.books.length,
                  itemBuilder: (context, i) {
                    final book = row.books[i];
                    return _ShelfCoverTile(
                      book: book,
                      onTap: () {
                        final progress =
                            ShelfProgressStore(ref.read(prefsProvider)).loadBook(book.id);
                        if (progress != null) {
                          context.push(
                            '/shelf/${book.id}/read?section=${Uri.encodeComponent(progress.sectionId)}&page=${progress.pageIndex}',
                          );
                        } else {
                          context.push('/shelf/${book.id}');
                        }
                      },
                    );
                  },
                ),
                const SizedBox(height: 24),
              ],
            ],
            ),
          );
        },
      ),
    );
  }

  List<({ShelfGroup group, List<ShelfBookSummary> books})> _groupBooks(ShelfListData data) {
    final map = <String, List<ShelfBookSummary>>{};
    for (final g in data.groups) {
      map[g.id] = [];
    }
    map.putIfAbsent('default', () => []);
    for (final book in data.items) {
      map.putIfAbsent(book.groupId, () => []).add(book);
    }
    final order = [...data.groups]..sort((a, b) => b.sortOrder.compareTo(a.sortOrder));
    final seen = order.map((g) => g.id).toSet();
    final rows = <({ShelfGroup group, List<ShelfBookSummary> books})>[];
    for (final g in order) {
      final books = map[g.id] ?? const [];
      if (books.isNotEmpty) rows.add((group: g, books: books));
    }
    for (final id in map.keys) {
      if (seen.contains(id)) continue;
      final books = map[id] ?? const [];
      if (books.isNotEmpty) {
        rows.add((group: ShelfGroup(id: id, title: '未分组'), books: books));
      }
    }
    return rows;
  }
}

class _ShelfCoverTile extends StatelessWidget {
  const _ShelfCoverTile({required this.book, required this.onTap});

  final ShelfBookSummary book;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hue = shelfCoverHue(book.title);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                HSLColor.fromAHSL(1, hue.toDouble(), 0.42, 0.38).toColor(),
                HSLColor.fromAHSL(1, ((hue + 36) % 360).toDouble(), 0.36, 0.28).toColor(),
              ],
            ),
          ),
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 32),
                child: Align(
                  alignment: Alignment.topLeft,
                  child: Text(
                    book.title,
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15,
                      height: 1.35,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 10,
                bottom: 10,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text('平台', style: TextStyle(fontSize: 10, color: Colors.white)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
