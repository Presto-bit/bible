/// 阅读器「打卡到共读群」半屏（对齐 Web GroupCheckinSheet 核心流）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/badge_stats.dart';
import '../../core/theme.dart';
import '../social/social_repository.dart';
import 'reader_sheet.dart';

const _checkinBodyMax = 120;
const _checkinDefaultBody = '完成今日打卡 ✓';
const _checkinChips = [
  '很受触动',
  '为家人祷告',
  '愿与弟兄共勉',
  '完成今日打卡 ✓',
];

String _normalizeBody(String raw) {
  final t = raw.trim();
  if (t.isEmpty) return _checkinDefaultBody;
  return t.length > _checkinBodyMax ? t.substring(0, _checkinBodyMax) : t;
}

Future<void> showGroupCheckinSheet(
  BuildContext context,
  WidgetRef ref, {
  required String bookId,
  required String bookName,
  required int chapter,
}) {
  return showReaderSheet<void>(
    context: context,
    heightFactor: 0.72,
    builder: (_) => _GroupCheckinBody(
      bookId: bookId,
      bookName: bookName,
      chapter: chapter,
    ),
  );
}

class _GroupCheckinBody extends ConsumerStatefulWidget {
  const _GroupCheckinBody({
    required this.bookId,
    required this.bookName,
    required this.chapter,
  });
  final String bookId;
  final String bookName;
  final int chapter;

  @override
  ConsumerState<_GroupCheckinBody> createState() => _GroupCheckinBodyState();
}

class _GroupCheckinBodyState extends ConsumerState<_GroupCheckinBody> {
  String? _gid;
  final _body = TextEditingController();
  bool _busy = false;
  bool _submitted = false;
  String? _err;

  String get _ref =>
      '${widget.bookId.toUpperCase()}.${widget.chapter}';

  String get _label => '${widget.bookName} ${widget.chapter}';

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
            body: _normalizeBody(_body.text),
          );
      ref.read(badgeStatsRecorderProvider).recordGroupCheckin(groupId: gid);
      ref.invalidate(myGroupsProvider);
      if (!mounted) return;
      setState(() => _submitted = true);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => _err = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final groupsAsync = ref.watch(myGroupsProvider);
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 16 + bottom),
      child: groupsAsync.when(
        loading: () => const SizedBox(
          height: 160,
          child: Center(child: CircularProgressIndicator()),
        ),
        error: (e, _) => Text('加载失败：$e'),
        data: (groups) {
          if (_gid == null && groups.length == 1) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted && _gid == null) setState(() => _gid = groups.first.id);
            });
          }
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text('打卡到共读群',
                        style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 16)),
                  ),
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('关闭'),
                  ),
                ],
              ),
              Text(_label,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.inkFaint)),
              const SizedBox(height: 12),
              if (_submitted)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: Text('已打卡')),
                )
              else if (groups.isEmpty)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('你还没有加入共读群。',
                        style: TextStyle(
                            fontSize: 13, color: AppColors.inkFaint)),
                    const SizedBox(height: 8),
                    Text(
                      '可在「发现」加入或创建共读群',
                      style: TextStyle(
                          fontSize: 12,
                          color: AppColors.accentDeep.withValues(alpha: 0.9)),
                    ),
                  ],
                )
              else ...[
                const Text('选择群',
                    style:
                        TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: groups.map((g) {
                    final sel = _gid == g.id;
                    return ChoiceChip(
                      label: Text(g.name),
                      selected: sel,
                      onSelected: (_) => setState(() => _gid = g.id),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _body,
                  maxLength: _checkinBodyMax,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: '今日感想（可选）',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: _checkinChips
                      .map(
                        (c) => ActionChip(
                          label: Text(c, style: const TextStyle(fontSize: 12)),
                          onPressed: () => setState(() => _body.text = c),
                        ),
                      )
                      .toList(),
                ),
                if (_err != null) ...[
                  const SizedBox(height: 8),
                  Text(_err!,
                      style: const TextStyle(
                          color: Color(0xFFB54A4A), fontSize: 12)),
                ],
                const SizedBox(height: 14),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.accentDeep,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  onPressed: _gid == null || _busy ? null : _submit,
                  child: Text(_busy ? '提交中…' : '打卡'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
