/// 发现页：今日摘要 + 我的共读横滑卡 + 好友动态。布局对齐 canvas demo。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart';
import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';
import '../assistant/assistant_screen.dart';
import 'group_screen.dart';
import 'social_repository.dart';

/// 好友动态条目（从各群 feed 聚合非本人打卡）。
class FriendActivity {
  FriendActivity({
    required this.id,
    required this.who,
    required this.what,
    this.excerpt,
    required this.likes,
    required this.reactions,
    required this.ref,
  });
  final String id;
  final String who;
  final String what;
  final String? excerpt;
  final int likes;
  final Map<String, List<String>> reactions;
  final String? ref;
}

final friendActivityProvider = FutureProvider<List<FriendActivity>>((ref) async {
  final repo = ref.read(socialRepoProvider);
  final groups = await repo.myGroups();
  final items = <FriendActivity>[];
  for (final g in groups.take(5)) {
    try {
      final msgs = await repo.feed(g.id);
      for (final m in msgs) {
        if (m.mine) continue;
        if (m.kind != 'checkin') continue;
        final likes =
            m.reactions.values.fold<int>(0, (sum, users) => sum + users.length);
        items.add(FriendActivity(
          id: m.id,
          who: m.author,
          what: m.ref ?? '打卡',
          excerpt: m.body,
          likes: likes,
          reactions: m.reactions,
          ref: m.ref,
        ));
      }
    } catch (_) {
      // 单群失败不影响其他群
    }
  }
  return items.take(5).toList();
});

class DiscoverScreen extends ConsumerWidget {
  const DiscoverScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 游客身份即可浏览发现（与 H5 / canvas 一致）；登录仅影响服务端身份。
    return const Scaffold(
      body: SafeArea(child: _DiscoverBody()),
    );
  }
}

class _DiscoverBody extends ConsumerWidget {
  const _DiscoverBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groups = ref.watch(myGroupsProvider);
    final friends = ref.watch(friendsProvider);
    final activity = ref.watch(friendActivityProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(myGroupsProvider);
        ref.invalidate(friendsProvider);
        ref.invalidate(friendActivityProvider);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          groups.when(
            loading: () => const _TodayCard(text: '加载中…'),
            error: (_, __) => const _TodayCard(
                text: '还没有共读群 · 受邀或创建一个，和大家一起开始'),
            data: (list) {
              if (list.isEmpty) {
                return const _TodayCard(
                    text: '还没有共读群 · 受邀或创建一个，和大家一起开始');
              }
              return _TodayCard(
                text:
                    '${list.length} 个共读群 · 今天 ${activity.whenOrNull(data: (v) => v.length) ?? 0} 条好友动态',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => GroupScreen(groupId: list.first.id),
                )),
              );
            },
          ),
          const SizedBox(height: 14),
          groups.when(
            loading: () => const SizedBox(
                height: 140, child: Center(child: CircularProgressIndicator())),
            error: (e, _) => Center(child: Text('$e')),
            data: (list) {
              if (list.isEmpty) {
                return PaperCard(
                  tier: 2,
                  tint: AppColors.accent,
                  accent: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('共读群 · 一起读',
                          style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: AppColors.ink)),
                      const SizedBox(height: 6),
                      const Text(
                          '受好友邀请，或自己创建一个群，和大家按计划一起读、彼此打卡。',
                          style: TextStyle(
                              color: AppColors.inkSoft,
                              fontSize: 13,
                              height: 1.5)),
                      const SizedBox(height: 12),
                      FilledButton(
                        style: FilledButton.styleFrom(
                            backgroundColor: AppColors.accentDeep),
                        onPressed: () => _createGroup(context, ref),
                        child: const Text('创建共读群'),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: () => _joinGroup(context, ref),
                        child: const Text('邀请码加入'),
                      ),
                    ],
                  ),
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionRow(
                    title: '我的共读',
                    action: '查看全部 ›',
                    onAction: () => _showAllGroups(context, list),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 148,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 10),
                      itemBuilder: (_, i) => SizedBox(
                        width: MediaQuery.of(context).size.width * 0.76,
                        child: _GroupCard(group: list[i]),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 18),
          friends.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (list) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SectionRow(
                  title: '好友动态',
                  action: list.isEmpty ? null : '查看全部 ›',
                  onAction: list.isEmpty
                      ? null
                      : () => _showAllShares(context, ref),
                ),
                const SizedBox(height: 8),
                if (list.isEmpty)
                  PaperCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('添加好友后可见动态',
                            style: TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                                color: AppColors.ink)),
                        const SizedBox(height: 6),
                        const Text('好友的经文打卡与笔记会出现在这里。',
                            style: TextStyle(
                                color: AppColors.inkSoft,
                                fontSize: 13,
                                height: 1.5)),
                        const SizedBox(height: 10),
                        OutlinedButton(
                          onPressed: () => _addFriend(context, ref),
                          child: const Text('加好友'),
                        ),
                      ],
                    ),
                  )
                else
                  activity.when(
                    loading: () => const Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                    error: (_, __) => const _EmptyHint(
                        text: '暂无好友动态，去群里打卡或等好友分享吧'),
                    data: (shares) {
                      if (shares.isEmpty) {
                        return const _EmptyHint(
                            text: '暂无好友动态，去群里打卡或等好友分享吧');
                      }
                      return Column(
                        children: shares
                            .map((s) => Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: _FriendShareCard(activity: s),
                                ))
                            .toList(),
                      );
                    },
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showAllGroups(BuildContext context, List<Group> list) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => _AllGroupsScreen(groups: list),
    ));
  }

  void _showAllShares(BuildContext context, WidgetRef ref) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => const _AllSharesScreen(),
    ));
  }

  Future<void> _createGroup(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final name = await _prompt(context, '新建共读群', '群名称');
    if (name == null || name.trim().isEmpty) return;
    try {
      await ref.read(socialRepoProvider).createGroup(name.trim());
      ref.invalidate(myGroupsProvider);
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('建群失败：$e')));
    }
  }

  Future<void> _joinGroup(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final code = await _prompt(context, '加入共读群', '邀请码（6 位）');
    if (code == null || code.trim().isEmpty) return;
    try {
      await ref.read(socialRepoProvider).joinGroup(code.trim());
      ref.invalidate(myGroupsProvider);
    } catch (e) {
      messenger.showSnackBar(const SnackBar(content: Text('加入失败：邀请码无效')));
    }
  }

  Future<void> _addFriend(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final handle = await _prompt(context, '添加好友', '对方账号');
    if (handle == null || handle.trim().isEmpty) return;
    try {
      await ref.read(socialRepoProvider).addFriend(handle.trim());
      ref.invalidate(friendsProvider);
      ref.invalidate(friendActivityProvider);
    } catch (e) {
      messenger.showSnackBar(const SnackBar(content: Text('添加失败：用户不存在')));
    }
  }
}

class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.text, this.onTap});
  final String text;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      tier: 2,
      tint: AppColors.accent,
      accent: true,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('今日',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 4),
          Text(text,
              style: const TextStyle(
                  color: AppColors.inkSoft, fontSize: 13, height: 1.5)),
        ],
      ),
    );
  }
}

class _SectionRow extends StatelessWidget {
  const _SectionRow({required this.title, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title,
            style: const TextStyle(
                fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink)),
        const Spacer(),
        if (action != null)
          GestureDetector(
            onTap: onAction,
            child: Text(action!,
                style: const TextStyle(
                    color: AppColors.inkFaint, fontSize: 12)),
          ),
      ],
    );
  }
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({required this.group});
  final Group group;

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      tier: 2,
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => GroupScreen(groupId: group.id),
      )),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(group.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 14)),
              ),
              if (group.isOwner)
                const Text('群主',
                    style: TextStyle(
                        color: AppColors.accentDeep, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 4),
          Text('${group.members} 位成员',
              style: const TextStyle(color: AppColors.inkSoft, fontSize: 12)),
          const Spacer(),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: 0.42,
              minHeight: 6,
              backgroundColor: AppColors.line,
              color: AppColors.accent,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text('进入群聊 ›',
                  style: TextStyle(color: AppColors.inkFaint, fontSize: 12)),
              Text('去打卡 ›',
                  style: TextStyle(
                      color: AppColors.accentDeep,
                      fontWeight: FontWeight.w600,
                      fontSize: 12)),
            ],
          ),
        ],
      ),
    );
  }
}

class _FriendShareCard extends ConsumerStatefulWidget {
  const _FriendShareCard({required this.activity});
  final FriendActivity activity;

  @override
  ConsumerState<_FriendShareCard> createState() => _FriendShareCardState();
}

class _FriendShareCardState extends ConsumerState<_FriendShareCard> {
  bool _liked = false;

  int get _likeCount {
    final base = widget.activity.likes;
    return _liked ? base + 1 : base;
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.activity;
    return PaperCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(s.who,
              style: const TextStyle(
                  fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 4),
          Text(s.what,
              style: const TextStyle(color: AppColors.inkSoft, fontSize: 13)),
          if (s.excerpt != null && s.excerpt!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(s.excerpt!,
                style: const TextStyle(fontSize: 13, height: 1.5)),
          ],
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () async {
              setState(() => _liked = !_liked);
              try {
                await ref
                    .read(socialRepoProvider)
                    .react(s.id, _liked ? '❤️' : '👍');
                ref.invalidate(friendActivityProvider);
              } catch (_) {}
            },
            child: Row(
              children: [
                Icon(
                  _liked ? Icons.favorite : Icons.favorite_border,
                  size: 18,
                  color: _liked ? AppColors.accent : AppColors.inkFaint,
                ),
                const SizedBox(width: 4),
                Text('$_likeCount',
                    style: const TextStyle(
                        color: AppColors.inkFaint, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => AssistantScreen(
                    seedRef: s.ref,
                    seedQuestion: s.excerpt ?? '请解释这段经文',
                  ),
                )),
                child: const Text('问小爱', style: TextStyle(fontSize: 12)),
              ),
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                onPressed: () =>
                    ref.read(navIndexProvider.notifier).set(1),
                child: const Text('我也在读', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AllGroupsScreen extends StatelessWidget {
  const _AllGroupsScreen({required this.groups});
  final List<Group> groups;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('全部共读群')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: groups.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) => _GroupCard(group: groups[i]),
      ),
    );
  }
}

class _AllSharesScreen extends ConsumerWidget {
  const _AllSharesScreen();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activity = ref.watch(friendActivityProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('全部好友分享')),
      body: activity.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (list) => ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) => _FriendShareCard(activity: list[i]),
        ),
      ),
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    return PaperCard(
      child: Text(text, style: const TextStyle(color: AppColors.inkFaint)),
    );
  }
}

Future<String?> _prompt(BuildContext context, String title, String hint) {
  final c = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: c,
        autofocus: true,
        decoration: InputDecoration(hintText: hint),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
        FilledButton(
            onPressed: () => Navigator.pop(ctx, c.text),
            child: const Text('确定')),
      ],
    ),
  );
}
