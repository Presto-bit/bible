/// 发现页：消息 | 好友双 Tab（对齐 PRODUCT §23 / Web DiscoverTab）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import 'group_screen.dart';
import 'social_repository.dart';

class DiscoverScreen extends ConsumerStatefulWidget {
  const DiscoverScreen({super.key});

  @override
  ConsumerState<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends ConsumerState<DiscoverScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _tabs.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
              child: Row(
                children: [
                  Expanded(
                    child: TabBar(
                      controller: _tabs,
                      labelColor: AppColors.ink,
                      unselectedLabelColor: AppColors.inkSoft,
                      indicatorColor: AppColors.accentDeep,
                      tabs: const [
                        Tab(text: '消息'),
                        Tab(text: '好友'),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: _tabs.index == 0 ? '建群' : '加好友',
                    onPressed: () {
                      if (_tabs.index == 0) {
                        context.push('/group/create');
                      } else {
                        context.push('/friend/add');
                      }
                    },
                    icon: const Icon(Icons.add),
                  ),
                ],
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(
                '消息与附件仅保留近 30 天',
                style: TextStyle(fontSize: 12, color: AppColors.inkSoft),
              ),
            ),
            Expanded(
              child: TabBarView(
                controller: _tabs,
                children: const [
                  _MessagesPane(),
                  _FriendsPane(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessagesPane extends ConsumerWidget {
  const _MessagesPane();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(conversationsProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('加载失败：$e', textAlign: TextAlign.center),
        ),
      ),
      data: (items) {
        if (items.isEmpty) {
          return ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Text('还没有消息',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 8),
              const Text(
                '创建共读群或添加好友后，会话会出现在这里。',
                style: TextStyle(color: AppColors.inkSoft, height: 1.5),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => context.push('/group/create'),
                child: const Text('新建群'),
              ),
              TextButton(
                onPressed: () => context.push('/friend/add'),
                child: const Text('加好友'),
              ),
            ],
          );
        }
        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(conversationsProvider);
            await ref.read(conversationsProvider.future);
          },
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: items.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, i) {
              final it = items[i];
              final canState = it.scope == 'group' || it.scope == 'dm';
              final tile = ListTile(
                title: Row(
                  children: [
                    if (it.pinned)
                      const Padding(
                        padding: EdgeInsets.only(right: 6),
                        child: Text('置顶',
                            style: TextStyle(
                                fontSize: 11, color: AppColors.inkSoft)),
                      ),
                    Expanded(
                      child: Text(it.title,
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                    if (it.muted)
                      const Text('静音',
                          style: TextStyle(
                              fontSize: 11, color: AppColors.inkSoft)),
                  ],
                ),
                subtitle: Text(
                  it.subtitle?.isNotEmpty == true ? it.subtitle! : '暂无消息',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: it.unread > 0
                    ? CircleAvatar(
                        radius: 12,
                        backgroundColor: AppColors.accentDeep,
                        child: Text(
                          it.unread > 99 ? '99+' : '${it.unread}',
                          style: const TextStyle(
                              fontSize: 10, color: Colors.white),
                        ),
                      )
                    : null,
                onTap: () => _open(context, ref, it),
                onLongPress: canState ? () => _menu(context, ref, it) : null,
              );
              if (!canState) return tile;
              return Dismissible(
                key: ValueKey('${it.scope}:${it.refId}'),
                direction: DismissDirection.endToStart,
                background: Container(
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.only(right: 20),
                  color: const Color(0xFFB1554A),
                  child: const Text(
                    '删除',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                confirmDismiss: (_) => _confirmHide(context, it),
                onDismissed: (_) async {
                  try {
                    await ref
                        .read(socialRepoProvider)
                        .patchConversationState(it.scope, it.refId, hidden: true);
                  } catch (_) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('删除失败，请重试')),
                      );
                    }
                  } finally {
                    ref.invalidate(conversationsProvider);
                  }
                },
                child: tile,
              );
            },
          ),
        );
      },
    );
  }

  Future<bool> _confirmHide(BuildContext context, ConversationItem it) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除会话'),
        content: Text('将「${it.title}」从消息列表移除？有新消息时会再次出现，聊天记录不会删除。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFB1554A)),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _open(
      BuildContext context, WidgetRef ref, ConversationItem it) async {
    final repo = ref.read(socialRepoProvider);
    if (it.scope == 'group') {
      await repo.patchConversationState('group', it.refId);
      if (!context.mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => GroupScreen(groupId: it.refId),
      ));
      ref.invalidate(conversationsProvider);
      return;
    }
    if (it.scope == 'dm') {
      await repo.patchConversationState('dm', it.refId);
      if (!context.mounted) return;
      context.push('/discover/dm/${it.refId}');
      return;
    }
    if (it.scope == 'inbox_friends') {
      // 切到好友 Tab：简单提示即可
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请切换到「好友」处理申请')));
    }
  }

  Future<void> _menu(
      BuildContext context, WidgetRef ref, ConversationItem it) async {
    if (it.scope != 'group' && it.scope != 'dm') return;
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(it.pinned ? '取消置顶' : '置顶'),
              onTap: () => Navigator.pop(ctx, 'pin'),
            ),
            ListTile(
              title: Text(it.muted ? '取消免打扰' : '免打扰'),
              onTap: () => Navigator.pop(ctx, 'mute'),
            ),
            ListTile(
              title: const Text('删除', style: TextStyle(color: Color(0xFFB1554A))),
              onTap: () => Navigator.pop(ctx, 'hide'),
            ),
          ],
        ),
      ),
    );
    if (action == null) return;
    final repo = ref.read(socialRepoProvider);
    try {
      if (action == 'pin') {
        await repo.patchConversationState(it.scope, it.refId, pinned: !it.pinned);
      } else if (action == 'mute') {
        await repo.patchConversationState(it.scope, it.refId, muted: !it.muted);
      } else if (action == 'hide') {
        final ok = await _confirmHide(context, it);
        if (!ok) return;
        await repo.patchConversationState(it.scope, it.refId, hidden: true);
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('操作失败：$e')));
      }
    }
    ref.invalidate(conversationsProvider);
  }
}

class _FriendsPane extends ConsumerWidget {
  const _FriendsPane();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final friends = ref.watch(friendsProvider);
    final reqs = ref.watch(friendRequestsProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(friendsProvider);
        ref.invalidate(friendRequestsProvider);
        await Future.wait([
          ref.read(friendsProvider.future),
          ref.read(friendRequestsProvider.future),
        ]);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
        children: [
          reqs.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (bundle) {
              if (bundle.incoming.isEmpty) return const SizedBox.shrink();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
                    child: Text('新的朋友',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                  ...bundle.incoming.map((r) {
                    final name = r.displayName ??
                        r.handle ??
                        r.fromUserId.substring(0, 8);
                    return ListTile(
                      title: Text(name),
                      subtitle: r.message != null ? Text(r.message!) : null,
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextButton(
                            onPressed: () async {
                              await ref
                                  .read(socialRepoProvider)
                                  .acceptFriendRequest(r.id);
                              ref.invalidate(friendRequestsProvider);
                              ref.invalidate(friendsProvider);
                              ref.invalidate(conversationsProvider);
                            },
                            child: const Text('同意'),
                          ),
                          TextButton(
                            onPressed: () async {
                              await ref
                                  .read(socialRepoProvider)
                                  .declineFriendRequest(r.id);
                              ref.invalidate(friendRequestsProvider);
                            },
                            child: const Text('拒绝'),
                          ),
                        ],
                      ),
                    );
                  }),
                  const Divider(),
                ],
              );
            },
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Text('好友', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
          friends.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(24),
              child: Text('加载失败：$e'),
            ),
            data: (list) {
              if (list.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      const Text('还没有好友。申请通过后可私信。',
                          style: TextStyle(color: AppColors.inkSoft)),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: () => context.push('/friend/add'),
                        child: const Text('加好友'),
                      ),
                    ],
                  ),
                );
              }
              return Column(
                children: list
                    .map(
                      (f) => ListTile(
                        title: Text(f.displayName ?? f.handle ?? f.userId),
                        subtitle: Text(f.handle != null ? '@${f.handle}' : '发消息',
                            style: const TextStyle(color: AppColors.inkSoft)),
                        onTap: () async {
                          final tid = await ref
                              .read(socialRepoProvider)
                              .openDm(f.userId);
                          if (!context.mounted) return;
                          context.push('/discover/dm/$tid');
                        },
                      ),
                    )
                    .toList(),
              );
            },
          ),
        ],
      ),
    );
  }
}
