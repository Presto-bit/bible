/// 加好友独立页（对齐 H5 /friend/add）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';

class AddFriendScreen extends ConsumerStatefulWidget {
  const AddFriendScreen({super.key});

  @override
  ConsumerState<AddFriendScreen> createState() => _AddFriendScreenState();
}

class _AddFriendScreenState extends ConsumerState<AddFriendScreen> {
  final _c = TextEditingController();
  var _busy = false;
  String? _msg;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final h = _c.text.trim();
    if (h.isEmpty) return;
    setState(() {
      _busy = true;
      _msg = null;
    });
    try {
      await ref.read(dioProvider).post('/social/friend-requests', data: {
        'handle': h,
      });
      setState(() => _msg = '已发送好友申请，等待对方同意');
    } catch (_) {
      setState(() => _msg = '发送失败：未找到该用户、已是好友，或服务暂不可用');
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('加好友')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('搜索 ID / 用户名',
                style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            TextField(
              controller: _c,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: '输入对方的用户 ID 或用户名',
                border: OutlineInputBorder(),
              ),
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: Text(_busy ? '发送中…' : '发送申请'),
            ),
            if (_msg != null) ...[
              const SizedBox(height: 16),
              Text(_msg!,
                  style: TextStyle(
                      color: _msg!.startsWith('已')
                          ? AppColors.accentDeep
                          : Colors.red.shade700)),
            ],
            const SizedBox(height: 12),
            const Text(
              '好友需对方同意后才能私信。消息仅保留近 30 天。',
              style: TextStyle(fontSize: 12, color: AppColors.inkSoft, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }
}
