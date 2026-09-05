/// 书架社交半屏：写笔记/书评、NoteHub、本书菜单（对齐 PWA）。
library;

import 'dart:async' show unawaited;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'shelf_navigator.dart';
import 'shelf_posts_repository.dart';
import 'shelf_repository.dart';

const _visPrefKey = 'shelf_post_visibility_pref';

Future<bool> requireShelfLogin(BuildContext context, WidgetRef ref) async {
  if (ref.read(sessionProvider).isSignedIn) return true;
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(
      content: Text('登录后可参与'),
      duration: Duration(milliseconds: 1600),
      behavior: SnackBarBehavior.floating,
    ),
  );
  return false;
}

ShelfPostVisibility _loadDefaultVisibility(WidgetRef ref) {
  try {
    final raw = ref.read(prefsProvider).getString(_visPrefKey);
    return ShelfPostVisibility.values.firstWhere(
      (v) => v.name == raw,
      orElse: () => ShelfPostVisibility.public,
    );
  } catch (_) {
    return ShelfPostVisibility.public;
  }
}

void _rememberVisibility(WidgetRef ref, ShelfPostVisibility v) {
  unawaited(ref.read(prefsProvider).setString(_visPrefKey, v.name));
}

String _visibilityLabel(ShelfPostVisibility v) => switch (v) {
      ShelfPostVisibility.public => '公开',
      ShelfPostVisibility.friends => '共读',
      ShelfPostVisibility.private => '私密',
    };

IconData _visibilityIcon(ShelfPostVisibility v) => switch (v) {
      ShelfPostVisibility.public => Icons.public_outlined,
      ShelfPostVisibility.friends => Icons.group_outlined,
      ShelfPostVisibility.private => Icons.lock_outline,
    };

Future<void> showShelfCommentsSheet(
  BuildContext context,
  WidgetRef ref, {
  required String bookId,
  required String bookTitle,
  required String sectionId,
  required String sectionTitle,
  int pageIndex = 0,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _ShelfCommentsSheet(
      bookId: bookId,
      bookTitle: bookTitle,
      sectionId: sectionId,
      sectionTitle: sectionTitle,
      pageIndex: pageIndex,
    ),
  );
}

class _ShelfCommentsSheet extends ConsumerStatefulWidget {
  const _ShelfCommentsSheet({
    required this.bookId,
    required this.bookTitle,
    required this.sectionId,
    required this.sectionTitle,
    required this.pageIndex,
  });

  final String bookId;
  final String bookTitle;
  final String sectionId;
  final String sectionTitle;
  final int pageIndex;

  @override
  ConsumerState<_ShelfCommentsSheet> createState() => _ShelfCommentsSheetState();
}

enum _CommentsTab { chapter, notes, hot, mine }

class _ShelfCommentsSheetState extends ConsumerState<_ShelfCommentsSheet> {
  _CommentsTab _tab = _CommentsTab.chapter;
  var _loading = true;
  List<ShelfPost> _posts = const [];
  final _draftCtrl = TextEditingController();
  var _submitting = false;

  @override
  void dispose() {
    _draftCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final kind = switch (_tab) {
        _CommentsTab.chapter => ShelfPostKind.review,
        _CommentsTab.notes => ShelfPostKind.note,
        _CommentsTab.hot => null,
        _CommentsTab.mine => null,
      };
      final data = await ref.read(shelfPostsRepoProvider).listPosts(
            widget.bookId,
            kind: kind,
            sectionId: _tab == _CommentsTab.hot ? null : widget.sectionId,
            mine: _tab == _CommentsTab.mine,
            sort: _tab == _CommentsTab.hot ? 'helpful' : 'latest',
          );
      if (mounted) setState(() => _posts = data.items);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('加载失败'), behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submitComment() async {
    final body = _draftCtrl.text.trim();
    if (body.isEmpty) return;
    if (!await requireShelfLogin(context, ref)) return;
    setState(() => _submitting = true);
    final refStr = shelfCheckinRef(widget.bookId, widget.sectionId, widget.pageIndex);
    try {
      await ref.read(shelfPostsRepoProvider).createPost(
            widget.bookId,
            kind: ShelfPostKind.review,
            ref: refStr,
            body: body,
            visibility: _loadDefaultVisibility(ref),
            sectionId: widget.sectionId,
            pageIndex: widget.pageIndex,
          );
      _draftCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已发布'), behavior: SnackBarBehavior.floating),
        );
        await _load();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('发布失败'), behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _emptyHint() => switch (_tab) {
        _CommentsTab.chapter => '本章还没有评论，写下第一句吧',
        _CommentsTab.notes => '本章暂无公开笔记，划选正文可写笔记',
        _CommentsTab.hot => '还没有热门评论',
        _CommentsTab.mine => '暂无内容',
      };

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height * 0.8;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
        height: h,
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.line,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.sectionTitle,
                          style: AppTypography.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          widget.bookTitle,
                          style: AppTypography.meta,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  _TabChip(
                    label: '本章评论',
                    active: _tab == _CommentsTab.chapter,
                    onTap: () {
                      setState(() => _tab = _CommentsTab.chapter);
                      unawaited(_load());
                    },
                  ),
                  _TabChip(
                    label: '公开笔记',
                    active: _tab == _CommentsTab.notes,
                    onTap: () {
                      setState(() => _tab = _CommentsTab.notes);
                      unawaited(_load());
                    },
                  ),
                  _TabChip(
                    label: '热门',
                    active: _tab == _CommentsTab.hot,
                    onTap: () {
                      setState(() => _tab = _CommentsTab.hot);
                      unawaited(_load());
                    },
                  ),
                  _TabChip(
                    label: '我的',
                    active: _tab == _CommentsTab.mine,
                    onTap: () {
                      setState(() => _tab = _CommentsTab.mine);
                      unawaited(_load());
                    },
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: _loading
                  ? const Center(child: Text('加载中…', style: AppTypography.meta))
                  : _posts.isEmpty
                      ? Center(child: Text(_emptyHint(), style: AppTypography.meta))
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: _posts.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 10),
                          itemBuilder: (context, i) {
                            final post = _posts[i];
                            return _CommentsPostCard(
                              post: post,
                              showVis: _tab == _CommentsTab.mine,
                              onOpen: () {
                                unawaited(
                                  showShelfNoteHubSheet(
                                    context,
                                    ref,
                                    bookId: widget.bookId,
                                    postId: post.id,
                                    abstractText: post.abstractText,
                                    onChanged: _load,
                                  ),
                                );
                              },
                              onLike: () async {
                                if (!await requireShelfLogin(context, ref)) return;
                                try {
                                  await ref.read(shelfPostsRepoProvider).toggleLike(widget.bookId, post.id);
                                  await _load();
                                } catch (_) {}
                              },
                            );
                          },
                        ),
            ),
            if (_tab == _CommentsTab.chapter)
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _draftCtrl,
                          minLines: 1,
                          maxLines: 4,
                          maxLength: 2000,
                          decoration: InputDecoration(
                            hintText: '写下对本章的想法…',
                            filled: true,
                            fillColor: AppColors.paper,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            counterText: '',
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: _submitting ? null : () => unawaited(_submitComment()),
                        child: Text(_submitting ? '…' : '发送'),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  const _TabChip({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: active
              ? const BoxDecoration(
                  border: Border(bottom: BorderSide(color: AppColors.accentDeep, width: 2)),
                )
              : null,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 14,
              fontWeight: active ? FontWeight.w600 : FontWeight.normal,
              color: active ? AppColors.ink : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}

class _CommentsPostCard extends StatelessWidget {
  const _CommentsPostCard({
    required this.post,
    required this.onOpen,
    required this.onLike,
    this.showVis = false,
  });

  final ShelfPost post;
  final VoidCallback onOpen;
  final VoidCallback onLike;
  final bool showVis;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink.withValues(alpha: 0.03),
      borderRadius: BorderRadius.circular(12),
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
              if (showVis) ...[
                const SizedBox(height: 4),
                Text(_visibilityLabel(post.visibility), style: AppTypography.meta),
              ],
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
              const SizedBox(height: 8),
              Row(
                children: [
                  TextButton(
                    onPressed: onLike,
                    child: Text(post.liked ? '♥ ${post.likesCount > 0 ? post.likesCount : ''}' : '♡ ${post.likesCount > 0 ? post.likesCount : ''}'),
                  ),
                  TextButton(
                    onPressed: onOpen,
                    child: Text('💬 ${post.repliesCount > 0 ? post.repliesCount : ''}'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> showShelfReaderMoreSheet(
  BuildContext context, {
  required String bookId,
  required String bookTitle,
  String? sectionTitle,
  required VoidCallback onWriteReview,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
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
          Text(bookTitle, style: AppTypography.title),
          if (sectionTitle != null && sectionTitle.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(sectionTitle, style: AppTypography.meta),
          ],
          const SizedBox(height: 16),
          _MoreBtn(
            label: '本书笔记',
            onTap: () {
              Navigator.pop(ctx);
              ShelfNavigator.openDetail(ctx, bookId, tab: 'notes');
            },
          ),
          const SizedBox(height: 8),
          _MoreBtn(
            label: '书评与公开笔记',
            onTap: () {
              Navigator.pop(ctx);
              ShelfNavigator.openDetail(ctx, bookId, tab: 'reviews');
            },
          ),
          const SizedBox(height: 8),
          _MoreBtn(
            label: '写书评',
            onTap: () {
              Navigator.pop(ctx);
              onWriteReview();
            },
          ),
        ],
      ),
    ),
  );
}

class _MoreBtn extends StatelessWidget {
  const _MoreBtn({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: TextButton(
        style: TextButton.styleFrom(
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          backgroundColor: AppColors.ink.withValues(alpha: 0.04),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        onPressed: onTap,
        child: Text(label, style: const TextStyle(fontSize: 15, color: AppColors.ink)),
      ),
    );
  }
}

Future<void> showShelfPostWriteSheet(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  required String contextLabel,
  String? contextBody,
  required String placeholder,
  required ShelfPostKind kind,
  bool showReadStatus = false,
  required Future<void> Function(String body, ShelfPostVisibility visibility, String? readStatus) onSave,
}) async {
  final controller = TextEditingController();
  var visibility = _loadDefaultVisibility(ref);
  var readStatus = 'reading';

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
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
              bottom: MediaQuery.viewInsetsOf(ctx).bottom + 20,
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
                      child: Text(title, style: AppTypography.title.copyWith(fontSize: 16)),
                    ),
                    PopupMenuButton<ShelfPostVisibility>(
                      icon: Icon(_visibilityIcon(visibility), color: AppColors.inkSoft),
                      onSelected: (v) {
                        setLocal(() => visibility = v);
                        _rememberVisibility(ref, v);
                      },
                      itemBuilder: (_) => ShelfPostVisibility.values
                          .map(
                            (v) => PopupMenuItem(
                              value: v,
                              child: Text(_visibilityLabel(v)),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ),
                Text(contextLabel, style: AppTypography.meta),
                if (contextBody != null && contextBody.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    contextBody.trim(),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.secondary.copyWith(fontSize: 14),
                  ),
                ],
                if (showReadStatus) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: [
                      ChoiceChip(
                        label: const Text('在读'),
                        selected: readStatus == 'reading',
                        onSelected: (_) => setLocal(() => readStatus = 'reading'),
                      ),
                      ChoiceChip(
                        label: const Text('已读完'),
                        selected: readStatus == 'finished',
                        onSelected: (_) => setLocal(() => readStatus = 'finished'),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  maxLines: 6,
                  minLines: 3,
                  decoration: InputDecoration(
                    hintText: placeholder,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () async {
                      final body = controller.text.trim();
                      if (body.isEmpty) return;
                      Navigator.pop(ctx);
                      await onSave(body, visibility, showReadStatus ? readStatus : null);
                    },
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
}

Future<void> showShelfNoteHubSheet(
  BuildContext context,
  WidgetRef ref, {
  required String bookId,
  required String postId,
  String? abstractText,
  VoidCallback? onChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _NoteHubBody(
      bookId: bookId,
      postId: postId,
      abstractText: abstractText,
      onChanged: onChanged,
    ),
  );
}

class _NoteHubBody extends ConsumerStatefulWidget {
  const _NoteHubBody({
    required this.bookId,
    required this.postId,
    this.abstractText,
    this.onChanged,
  });

  final String bookId;
  final String postId;
  final String? abstractText;
  final VoidCallback? onChanged;

  @override
  ConsumerState<_NoteHubBody> createState() => _NoteHubBodyState();
}

class _NoteHubBodyState extends ConsumerState<_NoteHubBody> {
  ShelfPost? _post;
  var _loading = true;
  final _replyCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void dispose() {
    _replyCtrl.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    setState(() => _loading = true);
    try {
      final post = await ref.read(shelfPostsRepoProvider).getPost(widget.bookId, widget.postId);
      if (mounted) setState(() => _post = post);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('加载失败'), behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _like() async {
    if (!await requireShelfLogin(context, ref)) return;
    try {
      final r = await ref.read(shelfPostsRepoProvider).toggleLike(widget.bookId, widget.postId);
      setState(() {
        _post = _post == null
            ? null
            : ShelfPost(
                id: _post!.id,
                bookId: _post!.bookId,
                userId: _post!.userId,
                kind: _post!.kind,
                ref: _post!.ref,
                body: _post!.body,
                visibility: _post!.visibility,
                author: _post!.author,
                abstractText: _post!.abstractText,
                sectionId: _post!.sectionId,
                pageIndex: _post!.pageIndex,
                spanStart: _post!.spanStart,
                spanEnd: _post!.spanEnd,
                readStatus: _post!.readStatus,
                likesCount: r.likesCount,
                repliesCount: _post!.repliesCount,
                createdAt: _post!.createdAt,
                liked: r.liked,
                replies: _post!.replies,
              );
      });
      widget.onChanged?.call();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('操作失败'), behavior: SnackBarBehavior.floating),
        );
      }
    }
  }

  Future<void> _reply() async {
    if (!await requireShelfLogin(context, ref)) return;
    final body = _replyCtrl.text.trim();
    if (body.isEmpty) return;
    try {
      await ref.read(shelfPostsRepoProvider).replyPost(widget.bookId, widget.postId, body);
      _replyCtrl.clear();
      await _reload();
      widget.onChanged?.call();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('回复失败'), behavior: SnackBarBehavior.floating),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height * 0.8;
    final post = _post;
    return SizedBox(
      height: h,
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          children: [
            const SizedBox(height: 8),
            Container(width: 36, height: 4, decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(2))),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
              child: Row(
                children: [
                  const Expanded(child: Text('公开笔记', style: AppTypography.title)),
                  IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
                ],
              ),
            ),
            Expanded(
              child: _loading || post == null
                  ? const Center(child: Text('加载中…', style: AppTypography.meta))
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      children: [
                        if ((widget.abstractText ?? post.abstractText)?.trim().isNotEmpty ?? false)
                          Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
                            decoration: BoxDecoration(
                              border: Border(
                                left: BorderSide(color: AppColors.accent.withValues(alpha: 0.45), width: 3),
                              ),
                            ),
                            child: Text(
                              widget.abstractText ?? post.abstractText ?? '',
                              style: AppTypography.secondary,
                            ),
                          ),
                        Text('${post.author.name} · ${formatShelfPostTime(post.createdAt)}', style: AppTypography.meta),
                        const SizedBox(height: 8),
                        Text(post.body, style: AppTypography.secondary.copyWith(height: 1.7)),
                        const SizedBox(height: 12),
                        TextButton.icon(
                          onPressed: _like,
                          icon: Icon(post.liked ? Icons.favorite : Icons.favorite_border, size: 18),
                          label: Text(post.likesCount > 0 ? '${post.likesCount}' : '赞'),
                        ),
                        if (post.replies.isNotEmpty) ...[
                          const Divider(),
                          Text('回复 (${post.replies.length})', style: AppTypography.meta),
                          for (final r in post.replies) ...[
                            const SizedBox(height: 10),
                            Text('${r.author.name} · ${formatShelfPostTime(r.createdAt)}', style: AppTypography.meta),
                            const SizedBox(height: 4),
                            Text(r.body, style: AppTypography.secondary),
                          ],
                        ],
                      ],
                    ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _replyCtrl,
                      decoration: const InputDecoration(
                        hintText: '写回复…',
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => unawaited(_reply()),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(onPressed: () => unawaited(_reply()), child: const Text('发送')),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 划词写笔记（复用 ThoughtVisibility 映射到 ShelfPostVisibility）。
Future<void> showShelfNoteWriteSheet(
  BuildContext context,
  WidgetRef ref, {
  required String bookId,
  required String sectionId,
  required String refStr,
  required String selectedText,
  int pageIndex = 0,
  VoidCallback? onChanged,
}) async {
  if (!await requireShelfLogin(context, ref)) return;
  await showShelfPostWriteSheet(
    context,
    ref,
    title: '写笔记',
    contextLabel: '书架笔记',
    contextBody: selectedText,
    placeholder: '写下这段文字给你的启发…',
    kind: ShelfPostKind.note,
    onSave: (body, visibility, _) async {
      final spanStart = findPlainTextSpanFromRef(refStr);
      final spanEnd = spanStart != null ? spanStart + selectedText.trim().length : null;
      try {
        await ref.read(shelfPostsRepoProvider).createPost(
              bookId,
              kind: ShelfPostKind.note,
              ref: refStr,
              body: body,
              visibility: visibility,
              sectionId: sectionId,
              pageIndex: pageIndex,
              spanStart: spanStart,
              spanEnd: spanEnd,
            );
        onChanged?.call();
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('已发布'), behavior: SnackBarBehavior.floating),
          );
        }
      } catch (_) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('发布失败'), behavior: SnackBarBehavior.floating),
          );
        }
      }
    },
  );
}

int? findPlainTextSpanFromRef(String refStr) {
  final at = refStr.indexOf('@');
  if (at < 0) return null;
  final part = refStr.substring(at + 1);
  final dash = part.indexOf('-');
  if (dash <= 0) return null;
  return int.tryParse(part.substring(0, dash));
}
