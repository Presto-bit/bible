/// 共读群：消息流（仅打卡/任务，不支持自由聊天）+ emoji 互动 + 群主任务。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'social_repository.dart';

const _emojis = ['🙏', '❤️', '🔥', '👍'];

class GroupScreen extends ConsumerWidget {
  const GroupScreen({super.key, required this.groupId});
  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(groupDetailProvider(groupId));
    final feed = ref.watch(groupFeedProvider(groupId));
    return Scaffold(
      appBar: AppBar(
        title: detail.maybeWhen(
            data: (d) => Text(d.name), orElse: () => const Text('共读群')),
        actions: [
          detail.maybeWhen(
            data: (d) => IconButton(
              icon: const Icon(Icons.info_outline),
              onPressed: () => _showInfo(context, d),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: feed.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (messages) {
          if (messages.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text('还没有打卡，点下方按钮开始第一次打卡',
                    style: TextStyle(color: AppColors.inkFaint)),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(groupFeedProvider(groupId)),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: messages.length,
              itemBuilder: (_, i) =>
                  _MessageCard(groupId: groupId, msg: messages[i]),
            ),
          );
        },
      ),
      floatingActionButton: detail.maybeWhen(
        data: (d) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (d.isOwner)
              FloatingActionButton.small(
                heroTag: 'task',
                backgroundColor: AppColors.gold,
                onPressed: () => _createTask(context, ref, d),
                child: const Icon(Icons.assignment_add),
              ),
            const SizedBox(width: 12),
            FloatingActionButton.extended(
              heroTag: 'checkin',
              backgroundColor: AppColors.accentDeep,
              onPressed: () => _checkin(context, ref, d),
              icon: const Icon(Icons.check_circle_outline),
              label: const Text('打卡'),
            ),
          ],
        ),
        orElse: () => null,
      ),
    );
  }

  void _showInfo(BuildContext context, GroupDetail d) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(d.name,
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w700)),
              if (d.intro != null && d.intro!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(d.intro!, style: const TextStyle(color: AppColors.inkSoft)),
              ],
              const SizedBox(height: 12),
              if (d.joinCode != null)
                Row(children: [
                  const Icon(Icons.qr_code, size: 18, color: AppColors.inkFaint),
                  const SizedBox(width: 6),
                  Text('邀请码：${d.joinCode}',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                ]),
              const SizedBox(height: 16),
              Text('成员（${d.members.length}）',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: d.members
                    .map((m) => Chip(
                          label: Text(
                              m.role == 'owner' ? '${m.name} · 群主' : m.name),
                          backgroundColor: AppColors.accentWash,
                        ))
                    .toList(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _createTask(
      BuildContext context, WidgetRef ref, GroupDetail d) async {
    final titleC = TextEditingController();
    final refC = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('发布任务'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
                controller: titleC,
                autofocus: true,
                decoration: const InputDecoration(labelText: '任务标题')),
            TextField(
                controller: refC,
                decoration:
                    const InputDecoration(labelText: '关联经文（可选，如 JHN.3）')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('发布')),
        ],
      ),
    );
    if (ok != true || titleC.text.trim().isEmpty) return;
    await ref.read(socialRepoProvider).createTask(d.id, titleC.text.trim(),
        ref: refC.text.trim().isEmpty ? null : refC.text.trim());
    ref.invalidate(groupDetailProvider(d.id));
  }

  Future<void> _checkin(
      BuildContext context, WidgetRef ref, GroupDetail d) async {
    final result = await showModalBottomSheet<_CheckinInput>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _CheckinSheet(tasks: d.tasks),
    );
    if (result == null) return;
    try {
      await ref.read(socialRepoProvider).checkin(d.id,
          ref: result.ref, taskId: result.taskId, body: result.body);
      ref.invalidate(groupFeedProvider(d.id));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('打卡须挂经文或任务')));
      }
    }
  }
}

class _MessageCard extends ConsumerWidget {
  const _MessageCard({required this.groupId, required this.msg});
  final String groupId;
  final GroupMessage msg;

  Future<void> _reportMessage(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final reason = await showDialog<String?>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('举报内容'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: '举报原因（可选）'),
          maxLines: 2,
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, controller.text),
              child: const Text('提交')),
        ],
      ),
    );
    if (reason == null) return;
    try {
      final res = await ref
          .read(socialRepoProvider)
          .reportMessage(msg.id, reason: reason);
      ref.invalidate(groupFeedProvider(groupId));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(res['hidden'] == true
                ? '已举报，该内容已被隐藏待复核'
                : '已举报，感谢反馈')));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('举报失败：$e')));
      }
    }
  }

  Future<void> _deleteMessage(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除内容'),
        content: const Text('确定删除这条内容？'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('取消')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('删除')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(socialRepoProvider).deleteMessage(msg.id);
      ref.invalidate(groupFeedProvider(groupId));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除失败：$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isTask = msg.kind == 'task';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: AppColors.accentWash,
                child: Text(msg.author.characters.first,
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.accentDeep)),
              ),
              const SizedBox(width: 8),
              Text(msg.author,
                  style: const TextStyle(
                      fontWeight: FontWeight.w600, color: AppColors.ink)),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                    color: (isTask ? AppColors.gold : AppColors.accentDeep)
                        .withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(6)),
                child: Text(isTask ? '任务' : '打卡',
                    style: TextStyle(
                        fontSize: 11,
                        color: isTask ? AppColors.gold : AppColors.accentDeep)),
              ),
              const Spacer(),
              Text('${msg.createdAt.month}/${msg.createdAt.day}',
                  style: const TextStyle(color: AppColors.inkFaint, fontSize: 12)),
              PopupMenuButton<String>(
                padding: EdgeInsets.zero,
                iconSize: 18,
                icon: const Icon(Icons.more_horiz, color: AppColors.inkFaint),
                onSelected: (v) async {
                  if (v == 'report') {
                    await _reportMessage(context, ref);
                  } else if (v == 'delete') {
                    await _deleteMessage(context, ref);
                  }
                },
                itemBuilder: (_) => [
                  if (msg.mine)
                    const PopupMenuItem(value: 'delete', child: Text('删除')),
                  if (!msg.mine)
                    const PopupMenuItem(value: 'report', child: Text('举报')),
                ],
              ),
            ],
          ),
          if (msg.ref != null) ...[
            const SizedBox(height: 8),
            Row(children: [
              const Icon(Icons.menu_book, size: 14, color: AppColors.gold),
              const SizedBox(width: 4),
              Text(msg.ref!,
                  style: const TextStyle(
                      color: AppColors.gold, fontWeight: FontWeight.w600)),
            ]),
          ],
          if (msg.body != null && msg.body!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(msg.body!, style: const TextStyle(color: AppColors.inkSoft, height: 1.6)),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            children: _emojis.map((e) {
              final count = msg.reactions[e]?.length ?? 0;
              final mine =
                  msg.reactions[e]?.isNotEmpty == true; // 简化：有人反应即高亮
              return GestureDetector(
                onTap: () async {
                  await ref.read(socialRepoProvider).react(msg.id, e);
                  ref.invalidate(groupFeedProvider(groupId));
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: count > 0
                        ? AppColors.accentWash
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: mine ? AppColors.accentDeep : AppColors.line),
                  ),
                  child: Text(count > 0 ? '$e $count' : e,
                      style: const TextStyle(fontSize: 13)),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _CheckinInput {
  _CheckinInput({this.ref, this.taskId, this.body});
  final String? ref;
  final String? taskId;
  final String? body;
}

class _CheckinSheet extends StatefulWidget {
  const _CheckinSheet({required this.tasks});
  final List<GroupTask> tasks;
  @override
  State<_CheckinSheet> createState() => _CheckinSheetState();
}

class _CheckinSheetState extends State<_CheckinSheet> {
  GroupTask? _task;
  final _refC = TextEditingController();
  final _bodyC = TextEditingController();

  @override
  void dispose() {
    _refC.dispose();
    _bodyC.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final hasBinding = _task != null || _refC.text.trim().isNotEmpty;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 16 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('打卡',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('打卡须挂经文或任务',
              style: TextStyle(color: AppColors.inkFaint, fontSize: 12)),
          const SizedBox(height: 14),
          if (widget.tasks.isNotEmpty) ...[
            const Text('选择任务', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: widget.tasks.map((t) {
                final sel = _task?.id == t.id;
                return ChoiceChip(
                  label: Text(t.title),
                  selected: sel,
                  selectedColor: AppColors.accentWash,
                  onSelected: (_) => setState(() {
                    _task = sel ? null : t;
                    if (!sel && t.ref != null) _refC.text = t.ref!;
                  }),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _refC,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: '关联经文（如 JHN.3.16）',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _bodyC,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: '今日感想（可选）',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.accentDeep,
                minimumSize: const Size.fromHeight(48)),
            onPressed: hasBinding
                ? () => Navigator.pop(
                      context,
                      _CheckinInput(
                        ref: _refC.text.trim().isEmpty ? null : _refC.text.trim(),
                        taskId: _task?.id,
                        body: _bodyC.text.trim().isEmpty ? null : _bodyC.text.trim(),
                      ),
                    )
                : null,
            child: const Text('提交打卡'),
          ),
        ],
      ),
    );
  }
}
