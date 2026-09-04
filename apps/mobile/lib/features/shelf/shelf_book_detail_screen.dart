/// 书架书目详情：书评 / 笔记 / 我的（对齐 PWA ShelfBookDetail）。
library;

import 'dart:async' show unawaited;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'shelf_brand_cover.dart';
import 'shelf_post_sheets.dart';
import 'shelf_posts_repository.dart';
import 'shelf_progress.dart';
import 'shelf_repository.dart';
import 'shelf_append_lesson_sheet.dart';
import 'shelf_reader_contract.dart';

class ShelfBookDetailScreen extends ConsumerStatefulWidget {
  const ShelfBookDetailScreen({
    super.key,
    required this.bookId,
    this.initialTab,
    this.celebrateFinished = false,
  });

  final String bookId;
  final String? initialTab;
  final bool celebrateFinished;

  @override
  ConsumerState<ShelfBookDetailScreen> createState() => _ShelfBookDetailScreenState();
}

class _ShelfBookDetailScreenState extends ConsumerState<ShelfBookDetailScreen> {
  ShelfBookDetail? _book;
  var _loadingBook = true;
  late _DetailTab _tab;
  var _loadingPosts = false;
  List<ShelfPost> _posts = const [];
  var _stats = (reviews: 0, notes: 0);
  var _canAppendLesson = false;

  @override
  void initState() {
    super.initState();
    _tab = switch (widget.initialTab) {
      'notes' => _DetailTab.notes,
      'mine' => _DetailTab.mine,
      _ => _DetailTab.reviews,
    };
    _loadBook();
    _loadPosts();
    _loadCap();
  }

  Future<void> _loadCap() async {
    final ok = await ref.read(shelfRepoProvider).canAppendCollectionLesson();
    if (mounted) setState(() => _canAppendLesson = ok);
  }

  Future<void> _loadBook() async {
    setState(() => _loadingBook = true);
    try {
      final book = await ref.read(shelfRepoProvider).getBook(widget.bookId);
      if (mounted) setState(() => _book = book);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('无法加载书目'), behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingBook = false);
    }
  }

  Future<void> _loadPosts() async {
    setState(() => _loadingPosts = true);
    try {
      final kind = switch (_tab) {
        _DetailTab.reviews => ShelfPostKind.review,
        _DetailTab.notes => ShelfPostKind.note,
        _DetailTab.mine => null,
      };
      final data = await ref.read(shelfPostsRepoProvider).listPosts(
            widget.bookId,
            kind: kind,
            mine: _tab == _DetailTab.mine,
            sort: _tab == _DetailTab.reviews ? 'latest' : 'latest',
          );
      if (mounted) {
        setState(() {
          _posts = data.items;
          _stats = data.stats;
        });
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('加载失败'), behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingPosts = false);
    }
  }

  String _readHref() {
    final progress = ShelfProgressStore(ref.read(prefsProvider)).loadBook(widget.bookId);
    if (progress == null) return '/shelf/${widget.bookId}/read';
    final q = 'section=${Uri.encodeComponent(progress.sectionId)}'
        '${progress.pageIndex > 0 ? '&page=${progress.pageIndex}' : ''}';
    return '/shelf/${widget.bookId}/read?$q';
  }

  Future<void> _writeReview() async {
    if (!await requireShelfLogin(context, ref)) return;
    final book = _book;
    final progress = ShelfProgressStore(ref.read(prefsProvider)).loadBook(widget.bookId);
    await showShelfPostWriteSheet(
      context,
      ref,
      title: '写书评',
      contextLabel: book?.title ?? '本书',
      placeholder: '写下你对本书的感受…',
      kind: ShelfPostKind.review,
      showReadStatus: true,
      onSave: (body, visibility, readStatus) async {
        final refStr = shelfCheckinRef(
          widget.bookId,
          progress?.sectionId ?? 'book',
          progress?.pageIndex ?? 0,
        );
        try {
          await ref.read(shelfPostsRepoProvider).createPost(
                widget.bookId,
                kind: ShelfPostKind.review,
                ref: refStr,
                body: body,
                visibility: visibility,
                sectionId: progress?.sectionId,
                pageIndex: progress?.pageIndex,
                readStatus: readStatus,
              );
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('已发布'), behavior: SnackBarBehavior.floating),
            );
            unawaited(_loadPosts());
          }
        } catch (_) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('发布失败'), behavior: SnackBarBehavior.floating),
            );
          }
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final book = _book;
    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => context.pop(),
        ),
        title: Text(book?.title ?? '书目', style: AppTypography.title, maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      floatingActionButton: _tab == _DetailTab.reviews
          ? FloatingActionButton.extended(
              onPressed: _writeReview,
              backgroundColor: AppColors.accentDeep,
              label: const Text('写书评'),
              icon: const Icon(Icons.edit_outlined),
            )
          : null,
      body: _loadingBook && book == null
          ? const Center(child: Text('加载中…', style: AppTypography.meta))
          : RefreshIndicator(
              onRefresh: () async {
                await _loadBook();
                await _loadPosts();
              },
              child: ListView(
                padding: const EdgeInsets.fromLTRB(0, 0, 0, 96),
                children: [
                  if (book != null) ...[
                    if (widget.celebrateFinished ||
                        (ShelfProgressStore(ref.read(prefsProvider)).loadBook(widget.bookId)?.isFinished ??
                            false))
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.line.withValues(alpha: 0.7)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('读完了', style: AppTypography.title.copyWith(fontSize: 17)),
                            const SizedBox(height: 6),
                            Text(
                              '《${book.title}》已读完，写几句感受，或看看大家的书评',
                              style: AppTypography.meta.copyWith(height: 1.45),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                FilledButton(
                                  onPressed: () {
                                    setState(() => _tab = _DetailTab.reviews);
                                    unawaited(_loadPosts());
                                    _writeReview();
                                  },
                                  child: const Text('写书评'),
                                ),
                                const SizedBox(width: 8),
                                TextButton(
                                  onPressed: () {
                                    ShelfProgressStore(ref.read(prefsProvider))
                                        .clearFinished(widget.bookId);
                                    context.push(_readHref());
                                  },
                                  child: const Text('再读一遍'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        border: Border(
                          bottom: BorderSide(color: AppColors.line.withValues(alpha: 0.6)),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          SizedBox(
                            width: 132,
                            height: 176,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: const ShelfBrandCover(),
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            book.title,
                            style: AppTypography.title.copyWith(fontSize: 20),
                            textAlign: TextAlign.center,
                          ),
                          if (book.author.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(book.author, style: AppTypography.meta, textAlign: TextAlign.center),
                          ],
                          if (book.subtitle.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              decoration: BoxDecoration(
                                color: AppColors.paper,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                book.subtitle,
                                style: AppTypography.secondary.copyWith(height: 1.55, fontSize: 14),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ],
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              onPressed: () {
                                ShelfProgressStore(ref.read(prefsProvider)).clearFinished(widget.bookId);
                                context.push(_readHref());
                              },
                              child: Text(
                                (widget.celebrateFinished ||
                                        (ShelfProgressStore(ref.read(prefsProvider))
                                                .loadBook(widget.bookId)
                                                ?.isFinished ??
                                            false))
                                    ? '重新阅读'
                                    : ShelfProgressStore(ref.read(prefsProvider)).loadBook(widget.bookId) !=
                                            null
                                        ? '继续阅读'
                                        : '开始阅读',
                              ),
                            ),
                          ),
                          if (_canAppendLesson &&
                              (book.bookType == 'collection' ||
                                  shelfIsChildrenLessonBook(id: book.id, title: book.title))) ...[
                            const SizedBox(height: 8),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton(
                                onPressed: () async {
                                  final ok = await showShelfAppendLessonSheet(
                                    context,
                                    ref,
                                    bookId: widget.bookId,
                                    bookTitle: book.title,
                                  );
                                  if (ok && mounted) await _loadBook();
                                },
                                child: const Text('添加课节'),
                              ),
                            ),
                          ],
                          const SizedBox(height: 10),
                          Text(
                            '${_stats.reviews} 篇书评 · ${_stats.notes} 条公开笔记',
                            style: AppTypography.meta,
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],
                  const SizedBox(height: 12),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _TabChip(
                          label: '书评',
                          active: _tab == _DetailTab.reviews,
                          onTap: () {
                            setState(() => _tab = _DetailTab.reviews);
                            unawaited(_loadPosts());
                          },
                        ),
                        _TabChip(
                          label: '公开笔记',
                          active: _tab == _DetailTab.notes,
                          onTap: () {
                            setState(() => _tab = _DetailTab.notes);
                            unawaited(_loadPosts());
                          },
                        ),
                        _TabChip(
                          label: '我的',
                          active: _tab == _DetailTab.mine,
                          onTap: () {
                            setState(() => _tab = _DetailTab.mine);
                            unawaited(_loadPosts());
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (_loadingPosts)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: Text('加载中…', style: AppTypography.meta)),
                    )
                  else if (_posts.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: Text('还没有内容', style: AppTypography.meta)),
                    )
                  else
                    for (final post in _posts)
                      _PostCard(
                        post: post,
                        showVis: _tab == _DetailTab.mine,
                        onOpen: () {
                          unawaited(
                            showShelfNoteHubSheet(
                              context,
                              ref,
                              bookId: widget.bookId,
                              postId: post.id,
                              abstractText: post.abstractText,
                              onChanged: _loadPosts,
                            ),
                          );
                        },
                        onLike: () async {
                          if (!await requireShelfLogin(context, ref)) return;
                          try {
                            await ref.read(shelfPostsRepoProvider).toggleLike(widget.bookId, post.id);
                            await _loadPosts();
                          } catch (_) {}
                        },
                        onVisChange: _tab == _DetailTab.mine
                            ? (v) async {
                                try {
                                  await ref
                                      .read(shelfPostsRepoProvider)
                                      .updateVisibility(widget.bookId, post.id, v);
                                  await _loadPosts();
                                } catch (_) {}
                              }
                            : null,
                        onDelete: _tab == _DetailTab.mine
                            ? () async {
                                try {
                                  await ref.read(shelfPostsRepoProvider).deletePost(widget.bookId, post.id);
                                  await _loadPosts();
                                } catch (_) {}
                              }
                            : null,
                      ),
                ],
              ),
            ),
    );
  }
}

enum _DetailTab { reviews, notes, mine }

class _TabChip extends StatelessWidget {
  const _TabChip({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: active,
        onSelected: (_) => onTap(),
        selectedColor: AppColors.accentWash,
        checkmarkColor: AppColors.accentDeep,
      ),
    );
  }
}

class _PostCard extends StatelessWidget {
  const _PostCard({
    required this.post,
    required this.onOpen,
    required this.onLike,
    this.onVisChange,
    this.onDelete,
    this.showVis = false,
  });

  final ShelfPost post;
  final VoidCallback onOpen;
  final VoidCallback onLike;
  final ValueChanged<ShelfPostVisibility>? onVisChange;
  final VoidCallback? onDelete;
  final bool showVis;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${post.author.name} · ${formatShelfPostTime(post.createdAt)}',
                style: AppTypography.meta,
              ),
              if (post.readStatus == 'finished')
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    '已读完',
                    style: AppTypography.meta.copyWith(
                      color: AppColors.accentDeep,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              if (post.abstractText != null && post.abstractText!.trim().isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  post.abstractText!,
                  style: AppTypography.secondary.copyWith(fontStyle: FontStyle.italic),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: 8),
              Text(
                post.body.length > 200 ? '${post.body.substring(0, 200)}…' : post.body,
                style: AppTypography.secondary.copyWith(height: 1.65),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  TextButton(onPressed: onLike, child: Text(post.liked ? '♥ ${post.likesCount > 0 ? post.likesCount : ''}' : '♡ ${post.likesCount > 0 ? post.likesCount : ''}')),
                  TextButton(onPressed: onOpen, child: Text('💬 ${post.repliesCount > 0 ? post.repliesCount : ''}')),
                  if (showVis && onVisChange != null)
                    DropdownButton<ShelfPostVisibility>(
                      value: post.visibility,
                      items: ShelfPostVisibility.values
                          .map((v) => DropdownMenuItem(value: v, child: Text(_visLabel(v))))
                          .toList(),
                      onChanged: (v) {
                        if (v != null) onVisChange!(v);
                      },
                    ),
                  if (showVis && onDelete != null)
                    TextButton(onPressed: onDelete, child: const Text('删除')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _visLabel(ShelfPostVisibility v) => switch (v) {
      ShelfPostVisibility.public => '公开',
      ShelfPostVisibility.friends => '共读',
      ShelfPostVisibility.private => '私密',
    };
