/// 分享到共读群 / 好友动态（对齐 Web ShareToSocialSheet）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import 'social_repository.dart';

Future<void> showShareToSocialSheet(
  BuildContext context,
  WidgetRef ref, {
  required String refText,
  required String refLabel,
  String? body,
  String kind = 'verse',
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _ShareToSocialBody(
      refText: refText,
      refLabel: refLabel,
      initialBody: body,
      kind: kind,
    ),
  );
}

/// 兼容旧入口。
Future<void> showShareToGroupSheet(
  BuildContext context,
  WidgetRef ref, {
  String? refText,
  String? body,
}) =>
    showShareToSocialSheet(
      context,
      ref,
      refText: refText ?? '',
      refLabel: refText ?? '分享',
      body: body,
    );

class _ShareToSocialBody extends ConsumerStatefulWidget {
  const _ShareToSocialBody({
    required this.refText,
    required this.refLabel,
    this.initialBody,
    this.kind = 'verse',
  });
  final String refText;
  final String refLabel;
  final String? initialBody;
  final String kind;

  @override
  ConsumerState<_ShareToSocialBody> createState() => _ShareToSocialBodyState();
}

class _ShareToSocialBodyState extends ConsumerState<_ShareToSocialBody> {
  int _tab = 0;
  late final _bodyCtrl =
      TextEditingController(text: widget.initialBody ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _bodyCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final groups = ref.watch(myGroupsProvider);
    final friends = ref.watch(friendsProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('分享',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 4),
            Text(widget.refLabel,
                style: const TextStyle(fontSize: 12, color: AppColors.inkFaint)),
            const SizedBox(height: 8),
            TextField(
              controller: _bodyCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                hintText: '附言（可选）',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                ChoiceChip(
                  label: const Text('共读群'),
                  selected: _tab == 0,
                  onSelected: (_) => setState(() => _tab = 0),
                  selectedColor: AppColors.accentWash,
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('好友动态'),
                  selected: _tab == 1,
                  onSelected: (_) => setState(() => _tab = 1),
                  selectedColor: AppColors.accentWash,
                ),
              ],
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 8),
            if (_tab == 0)
              groups.when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text('$e'),
                data: (list) {
                  if (list.isEmpty) {
                    return const Text('还没有共读群',
                        style: TextStyle(color: AppColors.inkFaint));
                  }
                  return Column(
                    children: list
                        .map((g) => ListTile(
                              title: Text(g.name),
                              trailing: const Text('打卡分享 ›',
                                  style: TextStyle(
                                      fontSize: 12, color: AppColors.inkFaint)),
                              onTap: _busy ? null : () => _shareGroup(g.id),
                            ))
                        .toList(),
                  );
                },
              )
            else
              friends.when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text('$e'),
                data: (list) {
                  if (list.isEmpty) {
                    return TextButton(
                      onPressed: () {
                        Navigator.pop(context);
                        context.push('/friend/add');
                      },
                      child: const Text('加好友后发布到动态'),
                    );
                  }
                  return FilledButton(
                    onPressed: _busy ? null : _shareFriends,
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.accentDeep),
                    child: Text(_busy ? '发布中…' : '发布到好友动态'),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _shareGroup(String gid) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(socialRepoProvider).shareToGroup(
            gid,
            ref: widget.refText.isEmpty ? null : widget.refText,
            body: _bodyCtrl.text.trim().isEmpty
                ? '分享了一段经文'
                : _bodyCtrl.text.trim(),
          );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _shareFriends() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(socialRepoProvider).publishShare(
            ref: widget.refText.isEmpty ? null : widget.refText,
            body: _bodyCtrl.text.trim().isEmpty
                ? widget.refLabel
                : _bodyCtrl.text.trim(),
            kind: widget.kind,
          );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
