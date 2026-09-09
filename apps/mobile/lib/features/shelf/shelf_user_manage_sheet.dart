/// 用户管理自己上传的书目/合集（对齐 Web ShelfBookManageSheet）。
library;

import 'dart:async' show unawaited;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'shelf_append_lesson_sheet.dart';
import 'shelf_repository.dart';

Future<bool> showShelfUserManageSheet(
  BuildContext context,
  WidgetRef ref, {
  required ShelfBookSummary book,
}) async {
  final changed = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.paper,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => _ShelfUserManageBody(book: book),
  );
  return changed == true;
}

class _ShelfUserManageBody extends ConsumerStatefulWidget {
  const _ShelfUserManageBody({required this.book});

  final ShelfBookSummary book;

  @override
  ConsumerState<_ShelfUserManageBody> createState() => _ShelfUserManageBodyState();
}

class _ShelfUserManageBodyState extends ConsumerState<_ShelfUserManageBody> {
  late final TextEditingController _title;
  late final TextEditingController _subtitle;
  ShelfBookDetail? _detail;
  var _loading = false;
  var _busy = false;

  bool get _isCollection => widget.book.bookType == 'collection';

  @override
  void initState() {
    super.initState();
    _title = TextEditingController(text: widget.book.title);
    _subtitle = TextEditingController(text: widget.book.subtitle);
    if (_isCollection) unawaited(_loadDetail());
  }

  @override
  void dispose() {
    _title.dispose();
    _subtitle.dispose();
    super.dispose();
  }

  Future<void> _loadDetail() async {
    setState(() => _loading = true);
    try {
      final d = await ref.read(shelfRepoProvider).getBook(widget.book.id);
      if (mounted) setState(() => _detail = d);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _saveMeta() async {
    final title = _title.text.trim();
    if (title.isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref.read(shelfRepoProvider).updatePlatformBook(
            widget.book.id,
            title: title,
            subtitle: _subtitle.text.trim(),
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已更新')),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteBook() async {
    final count = _detail?.sections.length ?? widget.book.sectionCount;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_isCollection ? '删除整个合集？' : '下架此书？'),
        content: Text(
          _isCollection
              ? '「${widget.book.title}」及全部 $count 份资料将从书架移除，并删除服务器文件。'
              : '「${widget.book.title}」将从书架移除，并删除服务器上的书籍文件。',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            child: Text(_isCollection ? '删除合集' : '下架删除'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(shelfRepoProvider).deletePlatformBook(widget.book.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_isCollection ? '已删除合集' : '已下架')),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _renameSection(ShelfSectionSummary sec) async {
    final ctrl = TextEditingController(text: sec.title);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('改名'),
        content: TextField(controller: ctrl, maxLength: 120),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('保存')),
        ],
      ),
    );
    final next = ctrl.text.trim();
    ctrl.dispose();
    if (ok != true || next.isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref.read(shelfRepoProvider).updateCollectionSection(
            widget.book.id,
            sec.id,
            title: next,
          );
      await _loadDetail();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已更新')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteSection(ShelfSectionSummary sec) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('删除「${sec.title}」？'),
        content: const Text('将从合集中移除，并删除对应文件。此操作不可恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(shelfRepoProvider).deleteCollectionSection(widget.book.id, sec.id);
      await _loadDetail();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已删除')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sections = _detail?.sections ?? const <ShelfSectionSummary>[];
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 12,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _isCollection ? '管理合集' : '管理书籍',
                style: AppTypography.title,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _title,
                maxLength: 80,
                decoration: InputDecoration(
                  labelText: _isCollection ? '合集名称' : '书名',
                ),
              ),
              TextField(
                controller: _subtitle,
                maxLength: 160,
                decoration: const InputDecoration(labelText: '副标题（可选）'),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _busy ? null : _saveMeta,
                child: const Text('保存名称'),
              ),
              if (_isCollection) ...[
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: Text('资料（${sections.length} 份）', style: AppTypography.meta),
                    ),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              final ok = await showShelfAppendLessonSheet(
                                context,
                                ref,
                                bookId: widget.book.id,
                                bookTitle: _title.text.trim(),
                              );
                              if (ok) await _loadDetail();
                            },
                      child: const Text('添加资料'),
                    ),
                  ],
                ),
                if (_loading)
                  const Padding(
                    padding: EdgeInsets.all(12),
                    child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                else if (sections.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 8),
                    child: Text('还没有资料', style: TextStyle(color: AppColors.inkSoft)),
                  )
                else
                  ...sections.map(
                    (sec) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        title: Text(sec.title),
                        subtitle: sec.unit != null && sec.unit!.isNotEmpty
                            ? Text(sec.unit!)
                            : null,
                        trailing: PopupMenuButton<String>(
                          onSelected: (v) {
                            if (v == 'rename') {
                              unawaited(_renameSection(sec));
                            } else if (v == 'delete') {
                              unawaited(_deleteSection(sec));
                            }
                          },
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'rename', child: Text('改名')),
                            PopupMenuItem(value: 'delete', child: Text('删除')),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: _busy ? null : _deleteBook,
                style: OutlinedButton.styleFrom(foregroundColor: Colors.red.shade700),
                child: Text(_isCollection ? '删除整个合集' : '下架删除'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
