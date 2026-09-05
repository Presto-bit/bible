/// 管理员管理书目（对齐 Web ShelfManageSheet）。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'shelf_repository.dart';

Future<bool> showShelfManageSheet(
  BuildContext context,
  WidgetRef ref, {
  required ShelfBookSummary book,
  required List<ShelfGroup> groups,
}) async {
  final changed = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.paper,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => _ShelfManageBody(book: book, groups: groups),
  );
  return changed == true;
}

enum _ManageMode { menu, rename, group }

class _ShelfManageBody extends ConsumerStatefulWidget {
  const _ShelfManageBody({required this.book, required this.groups});

  final ShelfBookSummary book;
  final List<ShelfGroup> groups;

  @override
  ConsumerState<_ShelfManageBody> createState() => _ShelfManageBodyState();
}

class _ShelfManageBodyState extends ConsumerState<_ShelfManageBody> {
  var _mode = _ManageMode.menu;
  late final TextEditingController _title;
  final _newGroup = TextEditingController();
  late List<ShelfGroup> _groups;
  var _busy = false;

  @override
  void initState() {
    super.initState();
    _title = TextEditingController(text: widget.book.title);
    _groups = List.of(widget.groups);
  }

  @override
  void dispose() {
    _title.dispose();
    _newGroup.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() fn, String okMsg) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await fn();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(okMsg)));
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _archive() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('下架此书？'),
        content: Text(
          '「${widget.book.title}」将从书架移除，全员不可见。文件仍保留在服务器，可重新上传入库。',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            child: const Text('下架删除'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _run(
      () => ref.read(shelfRepoProvider).adminArchiveBook(widget.book.id),
      '已下架',
    );
  }

  Future<void> _rename() async {
    final next = _title.text.trim();
    if (next.isEmpty || next == widget.book.title) {
      Navigator.pop(context, false);
      return;
    }
    await _run(
      () => ref.read(shelfRepoProvider).adminRenameBook(widget.book.id, next),
      '已改名',
    );
  }

  Future<void> _moveGroup(String groupId) async {
    if (groupId == (widget.book.groupId.isEmpty ? 'default' : widget.book.groupId)) {
      Navigator.pop(context, false);
      return;
    }
    await _run(
      () => ref.read(shelfRepoProvider).adminMoveBook(widget.book.id, groupId),
      '已移动分组',
    );
  }

  Future<void> _createAndMove() async {
    final t = _newGroup.text.trim();
    if (t.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      final repo = ref.read(shelfRepoProvider);
      final g = await repo.adminCreateGroup(t);
      await repo.adminMoveBook(widget.book.id, g.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已创建分组并移动')),
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reloadGroups() async {
    try {
      final list = await ref.read(shelfRepoProvider).adminListGroups();
      if (mounted) setState(() => _groups = list);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottom),
        child: switch (_mode) {
          _ManageMode.menu => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(widget.book.title, style: AppTypography.title),
                const SizedBox(height: 4),
                const Text('管理员操作', style: AppTypography.meta),
                const SizedBox(height: 12),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('改名'),
                  onTap: _busy ? null : () => setState(() => _mode = _ManageMode.rename),
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('移动分组'),
                  onTap: _busy
                      ? null
                      : () {
                          unawaited(_reloadGroups());
                          setState(() => _mode = _ManageMode.group);
                        },
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('下架删除', style: TextStyle(color: Colors.red.shade700)),
                  onTap: _busy ? null : () => unawaited(_archive()),
                ),
                TextButton(
                  onPressed: _busy ? null : () => Navigator.pop(context, false),
                  child: const Text('取消'),
                ),
              ],
            ),
          _ManageMode.rename => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('改名', style: AppTypography.title),
                const SizedBox(height: 12),
                TextField(
                  controller: _title,
                  maxLength: 80,
                  autofocus: true,
                  enabled: !_busy,
                  decoration: const InputDecoration(labelText: '书名'),
                ),
                Row(
                  children: [
                    TextButton(
                      onPressed: _busy ? null : () => setState(() => _mode = _ManageMode.menu),
                      child: const Text('返回'),
                    ),
                    const Spacer(),
                    FilledButton(
                      onPressed: _busy ? null : () => unawaited(_rename()),
                      child: const Text('保存'),
                    ),
                  ],
                ),
              ],
            ),
          _ManageMode.group => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('移动分组', style: AppTypography.title),
                const SizedBox(height: 8),
                ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(context).height * 0.35,
                  ),
                  child: ListView(
                    shrinkWrap: true,
                    children: [
                      for (final g in _groups)
                        ListTile(
                          title: Text(g.title),
                          trailing: g.id == widget.book.groupId
                              ? const Icon(Icons.check, size: 18)
                              : null,
                          onTap: _busy ? null : () => unawaited(_moveGroup(g.id)),
                        ),
                    ],
                  ),
                ),
                TextField(
                  controller: _newGroup,
                  maxLength: 24,
                  enabled: !_busy,
                  decoration: const InputDecoration(hintText: '新建分组名称'),
                ),
                FilledButton(
                  onPressed: _busy || _newGroup.text.trim().isEmpty
                      ? null
                      : () => unawaited(_createAndMove()),
                  child: const Text('创建并移入'),
                ),
                TextButton(
                  onPressed: _busy ? null : () => setState(() => _mode = _ManageMode.menu),
                  child: const Text('返回'),
                ),
              ],
            ),
        },
      ),
    );
  }
}
