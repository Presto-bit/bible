/// 群邀请收件箱（对齐 Web GroupInviteInbox）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';
import 'group_screen.dart';
import 'social_repository.dart';

class GroupInviteInbox extends ConsumerWidget {
  const GroupInviteInbox({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(groupInvitesProvider);
    return async.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (invites) {
        if (invites.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('群邀请',
                style: TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.ink)),
            const SizedBox(height: 8),
            ...invites.take(3).map((inv) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: PaperCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(inv.message ?? '邀请加入「${inv.groupName}」',
                            style: const TextStyle(fontSize: 14)),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            TextButton(
                              onPressed: () => _decline(context, ref, inv.id),
                              child: const Text('婉拒'),
                            ),
                            const Spacer(),
                            FilledButton(
                              onPressed: () => _accept(context, ref, inv),
                              style: FilledButton.styleFrom(
                                  backgroundColor: AppColors.accentDeep),
                              child: const Text('加入'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                )),
            const SizedBox(height: 8),
          ],
        );
      },
    );
  }

  Future<void> _accept(
      BuildContext context, WidgetRef ref, GroupInvite inv) async {
    try {
      await ref.read(socialRepoProvider).acceptInvite(inv.id);
      ref.invalidate(groupInvitesProvider);
      ref.invalidate(myGroupsProvider);
      if (!context.mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => GroupScreen(groupId: inv.groupId)),
      );
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('加入失败：$e')));
      }
    }
  }

  Future<void> _decline(BuildContext context, WidgetRef ref, String id) async {
    try {
      await ref.read(socialRepoProvider).declineInvite(id);
      ref.invalidate(groupInvitesProvider);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('操作失败：$e')));
      }
    }
  }
}
