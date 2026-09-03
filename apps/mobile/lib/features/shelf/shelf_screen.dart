/// 书架列表（Android 原生；对齐 PWA /shelf 图书馆视图）。
library;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'shelf_book_card.dart';
import 'shelf_library_store.dart';
import 'shelf_progress.dart';
import 'shelf_repository.dart';

final shelfListProvider = FutureProvider.autoDispose<ShelfListData>((ref) async {
  return ref.watch(shelfRepoProvider).listPlatform();
});

class ShelfScreen extends ConsumerStatefulWidget {
  const ShelfScreen({super.key});

  @override
  ConsumerState<ShelfScreen> createState() => _ShelfScreenState();
}

class _ShelfScreenState extends ConsumerState<ShelfScreen> {
  ShelfLibraryTab _tab = const ShelfLibraryTab.lastRead();
  bool _searchOpen = false;
  final _searchCtrl = TextEditingController();
  List<ShelfUserGroup> _userGroups = const [];

  @override
  void initState() {
    super.initState();
    _reloadGroups();
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

  @override
  Widget build(BuildContext context) {
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
          final books = _library.filterAndSort(data.items, _tab, _searchCtrl.text);
          return RefreshIndicator(
            onRefresh: () => _refresh(ref),
            child: CustomScrollView(
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
                          onTap: () => setState(() => _tab = const ShelfLibraryTab.lastRead()),
                        ),
                        _TabChip(
                          label: '上架时间',
                          selected: _tab.kind == ShelfLibraryTabKind.added,
                          onTap: () => setState(() => _tab = const ShelfLibraryTab.added()),
                        ),
                        for (final g in _userGroups)
                          _TabChip(
                            label: g.title,
                            selected: _tab.kind == ShelfLibraryTabKind.group && _tab.groupId == g.id,
                            onTap: () => setState(() => _tab = ShelfLibraryTab.group(g.id)),
                            onLongPress: () => _editGroup(g),
                          ),
                        if (showUngrouped)
                          _TabChip(
                            label: '未分组',
                            selected: _tab.kind == ShelfLibraryTabKind.group && _tab.groupId == shelfUngroupedId,
                            onTap: () => setState(() => _tab = const ShelfLibraryTab.group(shelfUngroupedId)),
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
                if (books.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(child: Text('书架空空的，可导入或选一本平台书目', style: AppTypography.meta)),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 32),
                    sliver: SliverGrid(
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 14,
                        crossAxisSpacing: 10,
                        childAspectRatio: 0.57,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, i) {
                          final book = books[i];
                          return ShelfBookCard(
                            book: book,
                            progressRatio: _library.bookProgressRatio(book.id),
                            onTap: () => context.push(_library.bookCardPath(book.id)),
                            onDetailTap: () => context.push('/shelf/${book.id}'),
                            onLongPress: () => _moveBook(book),
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
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          onLongPress: onLongPress,
          borderRadius: BorderRadius.circular(999),
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
      ),
    );
  }
}
