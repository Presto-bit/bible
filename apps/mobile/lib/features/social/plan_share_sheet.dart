/// 计划绑定到共读群（对齐 Web PlanShareToGroupSheet）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'social_repository.dart';

Future<void> showPlanShareToGroupSheet(
  BuildContext context,
  WidgetRef ref, {
  required String planId,
  required String planTitle,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _PlanShareBody(planId: planId, planTitle: planTitle),
  );
}

class _PlanShareBody extends ConsumerStatefulWidget {
  const _PlanShareBody({required this.planId, required this.planTitle});
  final String planId;
  final String planTitle;

  @override
  ConsumerState<_PlanShareBody> createState() => _PlanShareBodyState();
}

class _PlanShareBodyState extends ConsumerState<_PlanShareBody> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final groups = ref.watch(myGroupsProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('分享计划到群',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 4),
            Text('「${widget.planTitle}」',
                style: const TextStyle(color: AppColors.inkSoft)),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : () => _createFromPlan(),
              style: FilledButton.styleFrom(backgroundColor: AppColors.accentDeep),
              child: Text(_busy ? '创建中…' : '新建群并开始共读'),
            ),
            const SizedBox(height: 12),
            groups.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text('$e'),
              data: (list) {
                if (list.isEmpty) return const SizedBox.shrink();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('绑定到已有群',
                        style: TextStyle(
                            fontSize: 13, color: AppColors.inkFaint)),
                    ...list.where((g) => g.isOwner).map((g) => ListTile(
                          title: Text(g.name),
                          onTap: _busy ? null : () => _bind(g.id),
                        )),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _createFromPlan() async {
    setState(() => _busy = true);
    try {
      await ref.read(socialRepoProvider).createGroupFromPlan(widget.planId);
      ref.invalidate(myGroupsProvider);
      if (mounted) Navigator.pop(context);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('已创建共读群并绑定计划')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('失败：$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _bind(String gid) async {
    setState(() => _busy = true);
    try {
      await ref.read(socialRepoProvider).bindPlan(gid, widget.planId);
      ref.invalidate(myGroupsProvider);
      ref.invalidate(groupDetailProvider(gid));
      if (mounted) Navigator.pop(context);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('已绑定计划')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('失败：$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
