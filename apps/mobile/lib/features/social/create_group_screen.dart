/// 建群独立页（对齐 H5 /group/create）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';

class CreateGroupScreen extends ConsumerStatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  ConsumerState<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends ConsumerState<CreateGroupScreen> {
  final _c = TextEditingController();
  var _busy = false;
  String? _msg;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final n = _c.text.trim();
    if (n.isEmpty) return;
    setState(() {
      _busy = true;
      _msg = null;
    });
    try {
      final res =
          await ref.read(dioProvider).post('/social/groups', data: {'name': n});
      final d = res.data as Map<String, dynamic>;
      setState(() => _msg = '已建群：${d['name']} · 邀请码 ${d['join_code']}');
    } catch (_) {
      setState(() => _msg = '建群失败：服务暂不可用');
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('建群')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('创建共读群',
                style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            TextField(
              controller: _c,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: '群名称',
                border: OutlineInputBorder(),
              ),
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: Text(_busy ? '创建中…' : '创建共读群'),
            ),
            if (_msg != null) ...[
              const SizedBox(height: 16),
              Text(_msg!,
                  style: TextStyle(
                      color: _msg!.startsWith('已')
                          ? AppColors.accentDeep
                          : Colors.red.shade700)),
            ],
          ],
        ),
      ),
    );
  }
}
