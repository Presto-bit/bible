/// 书架列表（Android 原生；对齐 PWA /shelf 图书馆视图）。
library;

import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'shelf_book_card.dart';
import 'shelf_checkin_sheet.dart';
import 'shelf_library_store.dart';
import 'shelf_manage_sheet.dart';
import 'shelf_navigator.dart';
import 'shelf_progress.dart';
import 'shelf_repository.dart';
import 'shelf_append_lesson_sheet.dart';
import 'shelf_reader_contract.dart';

final shelfListProvider = FutureProvider<ShelfListData>((ref) async {
  ref.keepAlive();
  return ref.watch(shelfRepoProvider).listPlatform();
});

class ShelfScreen extends ConsumerStatefulWidget {
  const ShelfScreen({super.key});

  @override
  ConsumerState<ShelfScreen> createState() => _ShelfScreenState();
}

class _ShelfScreenState extends ConsumerState<ShelfScreen> {
  ShelfLibraryTab _tab = const ShelfLibraryTab.lastRead();
  ShelfProgressFilter _progressFilter = ShelfProgressFilter.reading;
  bool _searchOpen = false;
  final _searchCtrl = TextEditingController();
  List<ShelfUserGroup> _userGroups = const [];
  var _canAppendLesson = false;
  var _canManage = false;

  @override
  void initState() {
    super.initState();
    _reloadGroups();
    unawaited(_loadCaps());
  }

  Future<void> _loadCaps() async {
    final cap = await ref.read(shelfRepoProvider).platformCapabilities();
    if (!mounted) return;
    setState(() {
      _canAppendLesson = cap.canAppend;
      _canManage = cap.shelfAdmin;
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  ShelfLibraryStore get _library =>
      ShelfLibraryStore(ref.read(prefsProvider), ShelfProgressStore(ref.read(prefsProvider)));

  void _reloadGroups() {
    setState(() => _userGroups = _library.listGroups());
  }

  Future<void> _refresh(WidgetRef ref) async {
    await ref.read(shelfRepoProvider).listPlatform(force: true);
    ref.invalidate(shelfListProvider);
    _reloadGroups();
  }

  Future<void> _openImport() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['docx', 'txt', 'md'],
      withReadStream: false,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final path = file.path;
    if (path == null || path.isEmpty) return;
    if ((file.size) > shelfImportMaxBytes) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('单本不超过 20MB，可先拆章或转为 txt')),
      );
      return;
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('正在导入…')),
    );
    try {
      final res = await ref.read(shelfRepoProvider).importBook(path, file.name);
      ref.invalidate(shelfListProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('已导入「${res['title'] ?? file.name}」')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  Future<void> _newGroup() async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('新建分组'),
        content: TextField(
          controller: ctrl,
          maxLength: 20,
          decoration: const InputDecoration(hintText: '分组名称'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('创建')),
        ],
      ),
    );
    if (ok == true && ctrl.text.trim().isNotEmpty) {
      _library.createGroup(ctrl.text);
      _reloadGroups();
    }
    ctrl.dispose();
  }

  Future<void> _editGroup(ShelfUserGroup group) async {
    final ctrl = TextEditingController(text: group.title);
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: TextField(controller: ctrl, maxLength: 20),
            ),
            ListTile(
              title: const Text('保存名称'),
              onTap: () => Navigator.pop(ctx, 'save'),
            ),
            ListTile(
              title: const Text('删除分组', style: TextStyle(color: Color(0xFFB42318))),
              onTap: () => Navigator.pop(ctx, 'delete'),
            ),
          ],
        ),
      ),
    );
    if (action == 'save') {
      _library.renameGroup(group.id, ctrl.text);
      _reloadGroups();
    } else if (action == 'delete') {
      _library.deleteGroup(group.id);
      if (_tab.kind == ShelfLibraryTabKind.group && _tab.groupId == group.id) {
        _tab = const ShelfLibraryTab.lastRead();
      }
      _reloadGroups();
    }
    ctrl.dispose();
  }

  Future<void> _bookActions(ShelfBookSummary book) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(title: Text(book.title, style: AppTypography.meta)),
            ListTile(
              leading: const Icon(Icons.menu_book_outlined),
              title: const Text('继续阅读'),
              onTap: () => Navigator.pop(ctx, 'read'),
            ),
            ListTile(
              leading: const Icon(Icons.info_outline),
              title: const Text('书籍详情'),
              onTap: () => Navigator.pop(ctx, 'detail'),
            ),
            if (_canAppendLesson &&
                (book.bookType == 'collection' ||
                    shelfIsChildrenLessonBook(id: book.id, title: book.title)))
              ListTile(
                leading: const Icon(Icons.note_add_outlined),
                title: const Text('添加课节'),
                onTap: () => Navigator.pop(ctx, 'append'),
              ),
            ListTile(
              leading: const Icon(Icons.ios_share_outlined),
              title: const Text('分享到群'),
              onTap: () => Navigator.pop(ctx, 'share'),
            ),
            ListTile(
              leading: const Icon(Icons.folder_outlined),
              title: const Text('移到分组'),
              onTap: () => Navigator.pop(ctx, 'move'),
            ),
            if (_canManage)
              ListTile(
                leading: const Icon(Icons.settings_outlined),
                title: const Text('管理此书'),
                onTap: () => Navigator.pop(ctx, 'manage'),
              ),
          ],
        ),
      ),
    );
    if (!mounted || action == null) return;
    if (action == 'read') {
      await ShelfNavigator.openRead(context, book.id);
    } else if (action == 'detail') {
      await ShelfNavigator.openDetail(context, book.id);
    } else if (action == 'append') {
      final ok = await showShelfAppendLessonSheet(
        context,
        ref,
        bookId: book.id,
        bookTitle: book.title,
      );
      if (ok) await _refresh(ref);
    } else if (action == 'share') {
      await showShelfCheckinSheet(
        context,
        ref,
        bookId: book.id,
        bookTitle: book.title,
      );
    } else if (action == 'move') {
      await _moveBook(book);
    } else if (action == 'manage') {
      final groups =
          ref.read(shelfListProvider).asData?.value.groups ?? const <ShelfGroup>[];
      final changed = await showShelfManageSheet(
        context,
        ref,
        book: book,
        groups: groups,
      );
      if (changed) await _refresh(ref);
    }
  }

  Future<void> _moveBook(ShelfBookSummary book) async {
    final groups = _library.listGroups();
    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(title: Text(book.title, style: AppTypography.meta)),
            ListTile(
              title: const Text('未分组'),
              onTap: () {
                _library.setBookGroup(book.id, null);
                _reloadGroups();
                Navigator.pop(ctx);
              },
            ),
            for (final g in groups)
              ListTile(
                title: Text(g.title),
                onTap: () {
                  _library.setBookGroup(book.id, g.id);
                  _reloadGroups();
                  Navigator.pop(ctx);
                },
              ),
          ],
        ),
      ),
    );
  }

  void _selectTab(ShelfLibraryTab tab) {
    setState(() {
      if (tab.kind == ShelfLibraryTabKind.progress &&
          _tab.kind != ShelfLibraryTabKind.progress) {
        // 默认落到有书的档，避免「在读」空列表被当成白屏
        final items = ref.read(shelfListProvider).asData?.value.items ?? const [];
        _progressFilter = _library.preferredProgressFilter(items);
        _tab = ShelfLibraryTab.progress(_progressFilter);
        return;
      }
      if (tab.kind == ShelfLibraryTabKind.progress &&
          tab.progressStatus != null) {
        _progressFilter = tab.progressStatus!;
      }
      _tab = tab;
    });
  }

  Future<void> _openBook(ShelfBookSummary book) async {
    final id = book.id.trim();
    debugPrint('[ShelfScreen] _openBook id=$id title=${book.title}');
    if (id.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('无法打开：书目无效')),
      );
      return;
    }
    if (!mounted) return;
    HapticFeedback.selectionClick();
    final path = _library.bookCardPath(id);
    debugPrint('[ShelfScreen] push $path');
    try {
      final result = await ShelfNavigator.openCard(context, _library, id);
      debugPrint('[ShelfScreen] push done result=$result');
    } catch (e, st) {
      debugPrint('[ShelfScreen] push failed $e\n$st');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('无法打开：${e.toString().replaceFirst('Exception: ', '')}')),
      );
    }
  }

  Future<void> _openBookDetail(ShelfBookSummary book) async {
    final id = book.id.trim();
    if (id.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('无法打开：书目无效')),
      );
      return;
    }
    try {
      await ShelfNavigator.openDetail(context, id);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('无法打开详情：${e.toString().replaceFirst('Exception: ', '')}')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(shelfListProvider);
    ref.listen(shelfListProvider, (prev, next) {
      next.whenData((data) => _library.syncFromBooks(data.items));
    });
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
        title: _searchOpen
            ? TextField(
                controller: _searchCtrl,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: '搜索书名或作者',
                  border: InputBorder.none,
                  isDense: true,
                ),
                onChanged: (_) => setState(() {}),
              )
            : const Text('书架', style: AppTypography.title),
        actions: [
          if (_searchOpen)
            IconButton(
              icon: const Icon(Icons.close, size: 20),
              onPressed: () {
                _searchCtrl.clear();
                setState(() => _searchOpen = false);
              },
            )
          else ...[
            IconButton(
              icon: const Icon(Icons.search, size: 22),
              onPressed: () => setState(() => _searchOpen = true),
            ),
            IconButton(
              icon: const Icon(Icons.add, size: 24, color: AppColors.accentDeep),
              onPressed: _openImport,
            ),
          ],
        ],
      ),
      body: async.when(
        loading: () => const Center(child: Text('加载中…', style: AppTypography.meta)),
        error: (_, __) => const Center(child: Text('暂时无法加载书架', style: AppTypography.meta)),
        data: (data) {
          final showUngrouped = _library.ungroupedCount(data.items) > 0;
          final books = _library.filterAndSort(
            data.items,
            _tab.kind == ShelfLibraryTabKind.progress
                ? ShelfLibraryTab.progress(_progressFilter)
                : _tab,
            _searchCtrl.text,
          );
          return RefreshIndicator(
            onRefresh: () => _refresh(ref),
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: SizedBox(
                    height: 44,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      children: [
                        _TabChip(
                          label: '最近阅读',
                          selected: _tab.kind == ShelfLibraryTabKind.lastRead,
                          onTap: () => _selectTab(const ShelfLibraryTab.lastRead()),
                        ),
                        _TabChip(
                          label: '阅读进度',
                          selected: _tab.kind == ShelfLibraryTabKind.progress,
                          onTap: () => _selectTab(
                            const ShelfLibraryTab.progress(ShelfProgressFilter.reading),
                          ),
                        ),
                        _TabChip(
                          label: '上架时间',
                          selected: _tab.kind == ShelfLibraryTabKind.added,
                          onTap: () => _selectTab(const ShelfLibraryTab.added()),
                        ),
                        for (final g in _userGroups)
                          _TabChip(
                            label: g.title,
                            selected: _tab.kind == ShelfLibraryTabKind.group && _tab.groupId == g.id,
                            onTap: () => _selectTab(ShelfLibraryTab.group(g.id)),
                            onLongPress: () => _editGroup(g),
                          ),
                        if (showUngrouped)
                          _TabChip(
                            label: '未分组',
                            selected: _tab.kind == ShelfLibraryTabKind.group && _tab.groupId == shelfUngroupedId,
                            onTap: () => _selectTab(const ShelfLibraryTab.group(shelfUngroupedId)),
                          ),
                        if (_userGroups.length < shelfMaxUserGroups)
                          _TabChip(
                            label: '＋',
                            selected: false,
                            accent: true,
                            onTap: _newGroup,
                          ),
                      ],
                    ),
                  ),
                ),
                if (_tab.kind == ShelfLibraryTabKind.progress)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                      child: Builder(
                        builder: (context) {
                          final counts = _library.progressCounts(data.items);
                          return Wrap(
                            spacing: 8,
                            children: [
                              for (final entry in [
                                (ShelfProgressFilter.reading, '在读', counts.reading),
                                (ShelfProgressFilter.finished, '读完', counts.finished),
                                (ShelfProgressFilter.unread, '未读', counts.unread),
                              ])
                                _ProgressFilterChip(
                                  label: '${entry.$2}(${entry.$3})',
                                  selected: _progressFilter == entry.$1,
                                  onTap: () => _selectTab(
                                    ShelfLibraryTab.progress(entry.$1),
                                  ),
                                ),
                            ],
                          );
                        },
                      ),
                    ),
                  ),
                if (books.isEmpty)
                  SliverToBoxAdapter(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        minHeight: MediaQuery.sizeOf(context).height * 0.45,
                      ),
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 28),
                          child: Text(
                            _searchCtrl.text.trim().isNotEmpty
                                ? '没有匹配的书'
                                : _tab.kind == ShelfLibraryTabKind.progress
                                    ? (_progressFilter == ShelfProgressFilter.reading
                                        ? '暂无在读书，可切换「未读」查看书架'
                                        : _progressFilter == ShelfProgressFilter.finished
                                            ? '还没有读完的书'
                                            : '暂无未读书')
                                    : '书架空空的，可导入或等平台上架',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 15,
                              height: 1.45,
                              color: AppColors.inkSoft,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 32),
                    sliver: SliverGrid(
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 14,
                        crossAxisSpacing: 10,
                        // 3:4 封面 + 标题约两行：略增高格子避免裁切书名
                        childAspectRatio: 0.52,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, i) {
                          final book = books[i];
                          return ShelfBookCard(
                            book: book,
                            progressRatio: _library.bookProgressRatio(book.id),
                            onTap: () => _openBook(book),
                            onDetailTap: () => _openBookDetail(book),
                            onLongPress: () => _bookActions(book),
                          );
                        },
                        childCount: books.length,
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  const _TabChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.onLongPress,
    this.accent = false,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 4),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        onLongPress: onLongPress,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: selected
              ? const BoxDecoration(
                  border: Border(bottom: BorderSide(color: AppColors.accentDeep, width: 2)),
                )
              : null,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 14,
              fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
              color: accent ? AppColors.accentDeep : (selected ? AppColors.ink : AppColors.inkSoft),
            ),
          ),
        ),
      ),
    );
  }
}

class _ProgressFilterChip extends StatelessWidget {
  const _ProgressFilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AppColors.accentWash : AppColors.surfaceSunken,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected
                ? AppColors.accentDeep.withValues(alpha: 0.35)
                : AppColors.line,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            color: selected ? AppColors.accentDeep : AppColors.inkSoft,
          ),
        ),
      ),
    );
  }
}
