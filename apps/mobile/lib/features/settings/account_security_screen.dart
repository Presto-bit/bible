/// 账号与安全（独立页：从设置 push，返回回到设置）。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart' show sessionProvider;
import '../../core/theme.dart';
import '../auth/auth_controller.dart';

class AccountSecurityScreen extends ConsumerStatefulWidget {
  const AccountSecurityScreen({super.key});

  @override
  ConsumerState<AccountSecurityScreen> createState() =>
      _AccountSecurityScreenState();
}

class _AccountSecurityScreenState extends ConsumerState<AccountSecurityScreen> {
  final _pwd = TextEditingController();
  final _oldPwd = TextEditingController();
  final _newPwd = TextEditingController();
  var _busy = false;
  var _idCopied = false;
  String? _msg;

  @override
  void dispose() {
    _pwd.dispose();
    _oldPwd.dispose();
    _newPwd.dispose();
    super.dispose();
  }

  String get _userId =>
      ref.read(sessionProvider).effectiveUserCode.trim();

  Future<void> _copyId() async {
    final id = _userId;
    if (id.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: id));
    HapticFeedback.selectionClick();
    setState(() => _idCopied = true);
    await Future<void>.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _idCopied = false);
  }

  Future<void> _savePassword() async {
    final p = _pwd.text.trim();
    if (p.length < 6) {
      setState(() => _msg = '密码至少 6 位');
      return;
    }
    setState(() {
      _busy = true;
      _msg = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).setCredentials(
            username: '',
            password: p,
          );
      if (!mounted) return;
      _pwd.clear();
      setState(() => _msg = '密码已保存，已开启云同步');
    } catch (e) {
      if (!mounted) return;
      setState(() => _msg = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _changePassword() async {
    final n = _newPwd.text.trim();
    if (n.length < 6) {
      setState(() => _msg = '新密码至少 6 位');
      return;
    }
    setState(() {
      _busy = true;
      _msg = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).changePassword(
            oldPassword: _oldPwd.text,
            newPassword: n,
          );
      if (!mounted) return;
      _oldPwd.clear();
      _newPwd.clear();
      setState(() => _msg = '密码已更新');
    } catch (e) {
      if (!mounted) return;
      setState(() => _msg = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final id = _userId;

    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('账号与安全', style: AppTypography.title),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
        children: [
          _Card(
            children: [
              const Text(
                '用户 ID',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.inkSoft,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                '换机登录或联系客服时使用，建议复制保存。',
                style: TextStyle(fontSize: 12, color: AppColors.inkFaint, height: 1.4),
              ),
              const SizedBox(height: 10),
              if (id.isEmpty)
                const Text('账号准备中…', style: AppTypography.meta)
              else
                OutlinedButton(
                  onPressed: _copyId,
                  child: Text(_idCopied ? '已复制 ✓' : 'ID $id'),
                ),
            ],
          ),
          const SizedBox(height: 14),
          _Card(
            children: [
              Text(
                auth.hasPassword ? '修改密码' : '设置密码',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.inkSoft,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                auth.hasPassword
                    ? '已设密码，读经进度可云同步。'
                    : '设置后才会云同步。换机用用户 ID + 密码找回。',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.inkFaint,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 12),
              if (!auth.hasPassword) ...[
                TextField(
                  controller: _pwd,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: '密码（≥6 位）',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                FilledButton(
                  onPressed: _busy ? null : () => _savePassword(),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.accentDeep,
                  ),
                  child: Text(_busy ? '保存中…' : '保存密码'),
                ),
              ] else ...[
                TextField(
                  controller: _oldPwd,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: '当前密码',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _newPwd,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: '新密码（≥6 位）',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                FilledButton(
                  onPressed: _busy ? null : () => _changePassword(),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.accentDeep,
                  ),
                  child: Text(_busy ? '保存中…' : '更新密码'),
                ),
              ],
            ],
          ),
          const SizedBox(height: 14),
          _Card(
            children: [
              const Text(
                '在其他设备登录',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.inkSoft,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                '用用户 ID 或手机号 + 密码在另一台设备恢复进度。',
                style: TextStyle(fontSize: 12, color: AppColors.inkFaint, height: 1.4),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () => context.push('/login'),
                child: const Text('打开登录页'),
              ),
            ],
          ),
          if (_msg != null) ...[
            const SizedBox(height: 16),
            Text(
              _msg!,
              style: TextStyle(
                fontSize: 13,
                color: _msg!.contains('已') ? AppColors.accentDeep : Colors.red.shade700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: children,
        ),
      ),
    );
  }
}
