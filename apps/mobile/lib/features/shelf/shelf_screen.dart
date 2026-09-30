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
import 'shelf_library_store.dart';
import 'shelf_manage_sheet.dart';
import 'shelf_navigator.dart';
import 'shelf_progress.dart';
import 'shelf_repository.dart';
import 'shelf_append_lesson_sheet.dart';
import 'shelf_reader_contract.dart';
import 'shelf_user_manage_sheet.dart';
import 'shelf_share_sheet.dart';

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

  Future<void> _openImportMenu() async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.paper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.upload_file_outlined),
              title: const Text('上传书籍'),
              subtitle: Text(
                'docx、txt、md、pdf，单本不超过 ${shelfImportMaxMbLabel(isShelfAdmin: _canManage)}',
              ),
              onTap: () => Navigator.pop(ctx, 'book'),
            ),
            ListTile(
              leading: const Icon(Icons.folder_outlined),
              title: const Text('创建合集'),
              subtitle: const Text('先建空合集，再逐份添加资料'),
              onTap: () => Navigator.pop(ctx, 'collection'),
            ),
          ],
        ),
      ),
    );
    if (action == 'book') {
      await _openImport();
    } else if (action == 'collection') {
      await _createCollection();
    }
  }

  Future<void> _createCollection() async {
    final titleCtrl = TextEditingController();
    final subtitleCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('创建合集'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: titleCtrl,
              maxLength: 80,
              decoration: const InputDecoration(hintText: '合集名称'),
            ),
            TextField(
              controller: subtitleCtrl,
              maxLength: 160,
              decoration: const InputDecoration(hintText: '副标题（可选）'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('创建')),
        ],
      ),
    );
    final title = titleCtrl.text.trim();
    final subtitle = subtitleCtrl.text.trim();
    titleCtrl.dispose();
    subtitleCtrl.dispose();
    if (ok != true || title.isEmpty) return;
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('正在创建…')),
    );
    try {
      final res = await ref.read(shelfRepoProvider).createCollection(
            title: title,
            subtitle: subtitle.isEmpty ? null : subtitle,
          );
      ref.invalidate(shelfListProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('已创建合集「${res['title'] ?? title}」')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  Future<void> _openImport() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['docx', 'txt', 'md', 'pdf', 'epub'],
      withReadStream: false,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final path = file.path;
    if (path == null || path.isEmpty) return;
    final maxBytes = shelfImportLimitBytes(isShelfAdmin: _canManage);
    final maxLabel = shelfImportMaxMbLabel(isShelfAdmin: _canManage);
    if ((file.size) > maxBytes) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('单本不超过 $maxLabel，可先拆章或转为 txt')),
      );
      return;
    }
    if (!mounted) return;

    final stem = file.name.contains('.')
        ? file.name.substring(0, file.name.lastIndexOf('.'))
        : file.name;
    final titleCtrl = TextEditingController(text: stem);
    final authorCtrl = TextEditingController();
    final subtitleCtrl = TextEditingController();
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.paper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        final bottom = MediaQuery.viewInsetsOf(ctx).bottom;
        return Padding(
          padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                '确认导入',
                textAlign: TextAlign.center,
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
              ),
              const SizedBox(height: 8),
              Text(
                '均可留空；空书名则用文件名。',
                style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
              ),
              const SizedBox(height: 12),
              Text(
                file.name,
                style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: titleCtrl,
                maxLength: 80,
                decoration: const InputDecoration(
                  labelText: '书名（可选）',
                  hintText: '留空则用文件名',
                  counterText: '',
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: authorCtrl,
                maxLength: 80,
                decoration: const InputDecoration(
                  labelText: '作者（可选）',
                  counterText: '',
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: subtitleCtrl,
                maxLength: 160,
                decoration: const InputDecoration(
                  labelText: '副标题（可选）',
                  hintText: '一句话说明',
                  counterText: '',
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text('取消'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('导入'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
    final title = titleCtrl.text;
    final author = authorCtrl.text;
    final subtitle = subtitleCtrl.text;
    titleCtrl.dispose();
    authorCtrl.dispose();
    subtitleCtrl.dispose();
    if (confirmed != true || !mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('正在导入…')),
    );
    try {
      final res = await ref.read(shelfRepoProvider).importBook(
            path,
            file.name,
            title: title,
            author: author,
            subtitle: subtitle,
          );
      ref.invalidate(shelfListProvider);
      if (!mounted) return;
      final needsConfirm = res['needs_toc_confirm'] == true;
      final bookId = '${res['id'] ?? ''}';
      final importedTitle = '${res['title'] ?? file.name}';
      if (needsConfirm && bookId.isNotEmpty) {
        final outline = ((res['preview'] as Map?)?['toc_outline'] as List?) ?? const [];
        final apply = await showModalBottomSheet<bool>(
          context: context,
          backgroundColor: AppColors.paper,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          builder: (ctx) => SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    '确认目录',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '「$importedTitle」未识别到可靠样式目录。检测到 ${outline.length} 个建议切点。',
                    style: TextStyle(fontSize: 13, color: AppColors.inkSoft),
                  ),
                  const SizedBox(height: 12),
                  ...outline.take(8).map((e) {
                    final titleText = e is Map ? '${e['title'] ?? ''}' : '$e';
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Text(titleText, style: const TextStyle(fontSize: 14)),
                    );
                  }),
                  if (outline.length > 8)
                    Text(
                      '另有 ${outline.length - 8} 项…',
                      style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
                    ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('保持整本一节'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          onPressed: outline.length < 2 ? null : () => Navigator.pop(ctx, true),
                          child: const Text('应用建议'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
        if (apply != null && mounted) {
          try {
            await ref.read(shelfRepoProvider).confirmToc(bookId, applySuggested: apply);
            ref.invalidate(shelfListProvider);
          } catch (_) {}
        }
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('已导入「$importedTitle」')),
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

  String _continueLabel(ShelfBookSummary book) {
    final p = ShelfProgressStore(ref.read(prefsProvider)).loadBook(book.id);
    if (p?.isFinished == true) return '重新阅读';
    return p?.sectionId.isNotEmpty == true ? '继续阅读' : '开始阅读';
  }

  Future<void> _moveBookToGroup(ShelfBookSummary book) async {
    final groups = _library.listGroups();
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.paper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(title: Text(book.title, style: AppTypography.meta)),
            ListTile(
              title: const Text('未分组'),
              onTap: () {
                _library.setBookGroup(book.id, null);
                Navigator.pop(ctx);
              },
            ),
            for (final g in groups)
              ListTile(
                title: Text(g.title),
                onTap: () {
                  _library.setBookGroup(book.id, g.id);
                  Navigator.pop(ctx);
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _bookActions(ShelfBookSummary book) async {
    HapticFeedback.mediumImpact();
    final showAppend = _canAppendLesson &&
        (book.bookType == 'collection' ||
            shelfIsChildrenLessonBook(id: book.id, title: book.title));
    final showManage = book.canEdit || _canManage;

    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.paper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.menu_book_outlined),
              title: Text(_continueLabel(book)),
              onTap: () => Navigator.pop(ctx, 'read'),
            ),
            ListTile(
              leading: const Icon(Icons.info_outline),
              title: const Text('详情'),
              onTap: () => Navigator.pop(ctx, 'detail'),
            ),
            ListTile(
              leading: const Icon(Icons.drive_file_move_outline),
              title: const Text('移到分组'),
              onTap: () => Navigator.pop(ctx, 'move'),
            ),
            ListTile(
              leading: const Icon(Icons.share_outlined),
              title: const Text('分享'),
              onTap: () => Navigator.pop(ctx, 'share'),
            ),
            if (showManage)
              ListTile(
                leading: const Icon(Icons.settings_outlined),
                title: const Text('管理'),
                onTap: () => Navigator.pop(ctx, book.canEdit ? 'user_manage' : 'manage'),
              ),
            if (showAppend)
              ListTile(
                leading: const Icon(Icons.note_add_outlined),
                title: const Text('添加资料'),
                onTap: () => Navigator.pop(ctx, 'append'),
              ),
          ],
        ),
      ),
    );
    if (!mounted || picked == null) return;

    switch (picked) {
      case 'read':
        await _openBook(book);
      case 'detail':
        await _openBookDetail(book);
      case 'move':
        await _moveBookToGroup(book);
      case 'share':
        await showShelfShareSheet(
          context,
          ref,
          bookId: book.id,
          bookTitle: book.title,
          subtitle: book.subtitle,
          author: book.author,
        );
      case 'user_manage':
        final changed = await showShelfUserManageSheet(context, ref, book: book);
        if (changed) await _refresh(ref);
      case 'manage':
        final groups =
            ref.read(shelfListProvider).asData?.value.groups ?? const <ShelfGroup>[];
        final changed = await showShelfManageSheet(
          context,
          ref,
          book: book,
          groups: groups,
        );
        if (changed) await _refresh(ref);
      case 'append':
        final ok = await showShelfAppendLessonSheet(
          context,
          ref,
          bookId: book.id,
          bookTitle: book.title,
        );
        if (ok) await _refresh(ref);
    }
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
              onPressed: _openImportMenu,
            ),
          ],
        ],
      ),
      body: async.when(
        loading: () => const Center(child: Text('加载中…', style: AppTypography.meta)),
        error: (_, __) => const Center(child: Text('暂时无法加载书架', style: AppTypography.meta)),
        data: (data) {
          final repo = ref.read(shelfRepoProvider);
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
                        // 封面固定 3:4 + 间距 + 统一标题区；比值偏低留余量，避免窄屏裁切
                        childAspectRatio: 0.52,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, i) {
                          final book = books[i];
                          return ShelfBookCard(
                            book: book,
                            coverUrl: repo.coverUrl(
                              book.id,
                              book.coverStorageKey,
                              coverVersion: book.coverVersion,
                            ),
                            progressRatio: _library.bookProgressRatio(book.id),
                            onTap: () => _openBook(book),
                            onLongPress: () => unawaited(_bookActions(book)),
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
