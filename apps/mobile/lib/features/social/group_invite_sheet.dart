/// 邀请好友加入共读群。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'social_repository.dart';

Future<void> showGroupInviteSheet(
  BuildContext context,
  WidgetRef ref, {
  required String gid,
  required String groupName,
  required String joinCode,
  required List<String> memberUserIds,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _GroupInviteBody(
      gid: gid,
      groupName: groupName,
      joinCode: joinCode,
      memberUserIds: memberUserIds,
    ),
  );
}

class _GroupInviteBody extends ConsumerStatefulWidget {
  const _GroupInviteBody({
    required this.gid,
    required this.groupName,
    required this.joinCode,
    required this.memberUserIds,
  });
  final String gid;
  final String groupName;
  final String joinCode;
  final List<String> memberUserIds;

  @override
  ConsumerState<_GroupInviteBody> createState() => _GroupInviteBodyState();
}

class _GroupInviteBodyState extends ConsumerState<_GroupInviteBody> {
  final _picked = <String>{};
  var _pending = <String>{};
  bool _busy = false;
  String? _hint;

  @override
  void initState() {
    super.initState();
    _loadPending();
  }

  Future<void> _loadPending() async {
    try {
      final ids =
          await ref.read(socialRepoProvider).groupPendingInviteIds(widget.gid);
      setState(() {
        _pending = ids.toSet();
        _picked.addAll(ids);
      });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final friends = ref.watch(friendsProvider);
    final memberSet = widget.memberUserIds.toSet();
    final code = widget.joinCode.trim().toUpperCase();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('邀请加入「${widget.groupName}」',
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 16)),
            if (code.isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Text('邀请码 $code',
                      style: const TextStyle(color: AppColors.accentDeep)),
                  IconButton(
                    icon: const Icon(Icons.copy, size: 18),
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: code));
                      ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('已复制邀请码')));
                    },
                  ),
                ],
              ),
            ],
            if (_hint != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(_hint!, style: const TextStyle(fontSize: 13)),
              ),
            friends.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text('$e'),
              data: (list) {
                final candidates =
                    list.where((f) => !memberSet.contains(f.userId)).toList();
                if (candidates.isEmpty) {
                  return const Text('暂无可邀请的好友',
                      style: TextStyle(color: AppColors.inkFaint));
                }
                return SizedBox(
                  height: 240,
                  child: ListView(
                    children: candidates
                        .map((f) => CheckboxListTile(
                              value: _picked.contains(f.userId),
                              title: Text(f.name),
                              subtitle: _pending.contains(f.userId)
                                  ? const Text('已邀请，待确认',
                                      style: TextStyle(fontSize: 11))
                                  : null,
                              onChanged: _busy
                                  ? null
                                  : (v) => setState(() {
                                        if (v == true) {
                                          _picked.add(f.userId);
                                        } else {
                                          _picked.remove(f.userId);
                                        }
                                      }),
                            ))
                        .toList(),
                  ),
                );
              },
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : _send,
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.accentDeep,
                  minimumSize: const Size.fromHeight(44)),
              child: Text(_busy ? '发送中…' : '发送邀请'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _send() async {
    final ids = _picked
        .where((id) => !_pending.contains(id))
        .where((id) => !widget.memberUserIds.contains(id))
        .toList();
    if (ids.isEmpty) {
      setState(() => _hint = '请选择尚未邀请的好友');
      return;
    }
    setState(() => _busy = true);
    try {
      final sent =
          await ref.read(socialRepoProvider).sendGroupInvites(widget.gid, ids);
      setState(() => _hint = sent > 0 ? '已发送 $sent 条邀请' : '所选好友已在群内或已邀请');
      await _loadPending();
    } catch (e) {
      setState(() => _hint = '$e');
    } finally {
      setState(() => _busy = false);
    }
  }
}
