/// 群设置：群名、公告、计划绑定（对齐 Web GroupSettingsSheet 核心项）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../plans/plans_repository.dart';
import 'social_repository.dart';

Future<void> showGroupSettingsSheet(
  BuildContext context,
  WidgetRef ref, {
  required GroupDetail detail,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _GroupSettingsBody(detail: detail),
  );
}

class _GroupSettingsBody extends ConsumerStatefulWidget {
  const _GroupSettingsBody({required this.detail});
  final GroupDetail detail;

  @override
  ConsumerState<_GroupSettingsBody> createState() => _GroupSettingsBodyState();
}

class _GroupSettingsBodyState extends ConsumerState<_GroupSettingsBody> {
  late final _nameCtrl = TextEditingController(text: widget.detail.name);
  late final _announceCtrl =
      TextEditingController(text: widget.detail.announcement ?? '');
  String? _planId;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _planId = widget.detail.planId;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _announceCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final plans = ref.watch(plansListProvider);
    final isOwner = widget.detail.isOwner;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('群设置',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 12),
            TextField(
              controller: _nameCtrl,
              enabled: isOwner,
              decoration: const InputDecoration(labelText: '群名称'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _announceCtrl,
              enabled: isOwner,
              maxLines: 2,
              decoration: const InputDecoration(labelText: '群公告'),
            ),
            if (isOwner) ...[
              const SizedBox(height: 12),
              const Text('绑定读经计划',
                  style: TextStyle(fontSize: 13, color: AppColors.inkFaint)),
              plans.when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text('$e'),
                data: (list) => DropdownButtonFormField<String?>(
                  value: _planId,
                  items: [
                    const DropdownMenuItem(value: null, child: Text('不绑定')),
                    ...list.map((p) => DropdownMenuItem(
                          value: p.planId,
                          child: Text(p.title, overflow: TextOverflow.ellipsis),
                        )),
                  ],
                  onChanged: (v) => setState(() => _planId = v),
                ),
              ),
            ],
            if (widget.detail.planTitle != null) ...[
              const SizedBox(height: 8),
              Text('当前计划：${widget.detail.planTitle}',
                  style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
            ],
            const SizedBox(height: 16),
            if (isOwner)
              FilledButton(
                onPressed: _busy ? null : _save,
                style: FilledButton.styleFrom(
                    backgroundColor: AppColors.accentDeep),
                child: Text(_busy ? '保存中…' : '保存设置'),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await ref.read(socialRepoProvider).updateGroup(
            widget.detail.id,
            name: _nameCtrl.text.trim(),
            announcement: _announceCtrl.text.trim(),
            planId: _planId,
            clearPlan: _planId == null && widget.detail.planId != null,
          );
      ref.invalidate(groupDetailProvider(widget.detail.id));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存失败：$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
