/// 登录页：免注册即用，支持「用户ID」或「用户名 + 密码」登录。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final idf = _identifier.text.trim();
    if (idf.isEmpty) {
      setState(() => _error = '请输入用户ID或用户名');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .loginWithIdentifier(idf, _password.text);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('登录')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 12),
          const Text('登录 / 切换账号',
              style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink)),
          const SizedBox(height: 8),
          const Text('用「用户ID」或「用户名 + 密码」登录，数据按用户ID云端同步。',
              style: TextStyle(color: AppColors.inkSoft, height: 1.6)),
          const SizedBox(height: 28),
          TextField(
            controller: _identifier,
            decoration: const InputDecoration(
              labelText: '用户ID（8 位数字）或 用户名',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.person_outline),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _password,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: '密码（用户ID登录可留空）',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.lock_outline),
            ),
            onSubmitted: (_) => _login(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(_error!, style: const TextStyle(color: Color(0xFFB1554A))),
          ],
          const SizedBox(height: 24),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.accentDeep,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            onPressed: _busy ? null : _login,
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('登录'),
          ),
          const SizedBox(height: 16),
          const Text(
            '免注册即用：每台设备自动分配 8 位用户ID。设置用户名与密码后，可在其它设备用「用户名 + 密码」登录同一账号。',
            style: TextStyle(color: AppColors.inkFaint, fontSize: 12, height: 1.6),
          ),
        ],
      ),
    );
  }
}
