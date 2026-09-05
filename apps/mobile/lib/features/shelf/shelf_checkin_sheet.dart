/// 书架分享到共读群（对齐 Web ShelfCheckinSheet；可整本或按节）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/badge_stats.dart';
import '../../core/theme.dart';
import '../social/social_repository.dart';
import 'shelf_repository.dart';

const _checkinBodyMax = 120;
const _sectionChips = [
  '读到这里很有感触 🙏',
  '完成本节 ✓',
  '愿与弟兄共勉',
];
const _bookChips = [
  '推荐一本好书 📖',
  '一起来读',
  '愿与弟兄共勉',
];

String _normalizeBody(String raw, {required bool bookShare}) {
  final t = raw.trim();
  if (t.isEmpty) return bookShare ? '一起来读' : '完成本节 ✓';
  return t.length > _checkinBodyMax ? t.substring(0, _checkinBodyMax) : t;
}

Future<void> showShelfCheckinSheet(
  BuildContext context,
  WidgetRef ref, {
  required String bookId,
  required String bookTitle,
  String? sectionId,
  String sectionTitle = '',
  int pageIndex = 0,
  String? presetGroupId,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.paper,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: _ShelfCheckinBody(
        bookId: bookId,
        bookTitle: bookTitle,
        sectionId: sectionId,
        sectionTitle: sectionTitle,
        pageIndex: pageIndex,
        presetGroupId: presetGroupId,
      ),
    ),
  );
}

class _ShelfCheckinBody extends ConsumerStatefulWidget {
  const _ShelfCheckinBody({
    required this.bookId,
    required this.bookTitle,
    this.sectionId,
    this.sectionTitle = '',
    this.pageIndex = 0,
    this.presetGroupId,
  });

  final String bookId;
  final String bookTitle;
  final String? sectionId;
  final String sectionTitle;
  final int pageIndex;
  final String? presetGroupId;

  @override
  ConsumerState<_ShelfCheckinBody> createState() => _ShelfCheckinBodyState();
}

class _ShelfCheckinBodyState extends ConsumerState<_ShelfCheckinBody> {
  String? _gid;
  final _body = TextEditingController();
  var _busy = false;
  var _submitted = false;
  String? _err;

  bool get _bookShare =>
      widget.sectionId == null || widget.sectionId!.trim().isEmpty;

  String get _ref => _bookShare
      ? shelfBookShareRef(widget.bookId)
      : shelfCheckinRef(widget.bookId, widget.sectionId!, widget.pageIndex);

  String get _label => shelfCheckinLabel(
        widget.bookTitle,
        _bookShare ? '推荐书目' : widget.sectionTitle,
      );

  List<String> get _chips => _bookShare ? _bookChips : _sectionChips;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final gid = _gid;
    if (gid == null || _busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      await ref.read(socialRepoProvider).checkin(
            gid,
            ref: _ref,
            body: _normalizeBody(_body.text, bookShare: _bookShare),
          );
      ref.read(badgeStatsRecorderProvider).recordGroupCheckin(groupId: gid);
      if (!mounted) return;
      setState(() => _submitted = true);
      ref.invalidate(myGroupsProvider);
      Future.delayed(const Duration(milliseconds: 600), () {
        if (mounted) Navigator.of(context).pop();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _err = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final groupsAsync = ref.watch(myGroupsProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.line,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Expanded(
                  child: Text('分享到共读群', style: AppTypography.title),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            Text(_label, style: AppTypography.meta),
            const SizedBox(height: 12),
            groupsAsync.when(
              loading: () => const Text('加载群列表…', style: AppTypography.meta),
              error: (_, __) => const Text('无法加载群列表', style: AppTypography.meta),
              data: (groups) {
                if (groups.isEmpty) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('你还没有加入共读群。', style: AppTypography.secondary),
                      TextButton(
                        onPressed: () {
                          ref.read(navIndexProvider.notifier).set(3);
                          context.go('/');
                          Navigator.pop(context);
                        },
                        child: const Text('去发现'),
                      ),
                    ],
                  );
                }
                final gid = _gid ??
                    widget.presetGroupId ??
                    (groups.length == 1 ? groups.first.id : null);
                if (_gid == null && gid != null) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (mounted) setState(() => _gid = gid);
                  });
                }
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    DropdownButtonFormField<String>(
                      value: _gid,
                      decoration: const InputDecoration(labelText: '共读群'),
                      items: [
                        for (final g in groups)
                          DropdownMenuItem(value: g.id, child: Text(g.name)),
                      ],
                      onChanged: _busy ? null : (v) => setState(() => _gid = v),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _body,
                      maxLength: _checkinBodyMax,
                      decoration: InputDecoration(
                        labelText: '说点什么（可选）',
                        hintText: _bookShare ? '推荐一本好书…' : '读到这里很有感触…',
                      ),
                      enabled: !_busy && !_submitted,
                    ),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final chip in _chips)
                          ActionChip(
                            label: Text(chip, style: const TextStyle(fontSize: 12)),
                            onPressed: _busy || _submitted
                                ? null
                                : () => setState(() => _body.text = chip),
                          ),
                      ],
                    ),
                  ],
                );
              },
            ),
            if (_err != null) ...[
              const SizedBox(height: 8),
              Text(_err!, style: AppTypography.meta.copyWith(color: Colors.red)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy || _submitted || _gid == null ? null : _submit,
              child: Text(_submitted ? '已分享' : '分享'),
            ),
          ],
        ),
      ),
    );
  }
}
