/// 我的 · 设置（Flutter 原生，对齐 Web ProfileSettingsPanel 主路径）。
library;

import 'dart:async' show unawaited;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/app_update.dart';
import '../../core/app_update_dialog.dart';
import '../../core/h5_bridge_channel.dart' show discoverH5PathProvider;
import '../../core/overlay_h5.dart';
import '../../core/sync/sync_controller.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import '../bible/offline_download_sheet.dart';
import '../social/social_repository.dart';

/// 与 profile_screen 一致：官方客服号。
const _kOfficialSupportUserCode = '70625146';

class ProfileSettingsScreen extends ConsumerStatefulWidget {
  const ProfileSettingsScreen({super.key});

  @override
  ConsumerState<ProfileSettingsScreen> createState() =>
      _ProfileSettingsScreenState();
}

class _ProfileSettingsScreenState extends ConsumerState<ProfileSettingsScreen> {
  var _syncing = false;
  var _checkingUpdate = false;
  String? _versionLabel;

  @override
  void initState() {
    super.initState();
    unawaited(_loadVersion());
  }

  Future<void> _loadVersion() async {
    final v = await const AppUpdateService().installedVersion();
    if (!mounted) return;
    setState(() {
      _versionLabel = v.code > 0 ? '${v.name} (${v.code})' : v.name;
    });
  }

  Future<void> _openSupport() async {
    try {
      final tid =
          await ref.read(socialRepoProvider).openDm(_kOfficialSupportUserCode);
      if (!mounted) return;
      ref.read(navIndexProvider.notifier).set(3);
      ref.read(discoverH5PathProvider.notifier).go('/discover/dm/$tid');
      context.go('/');
    } catch (_) {
      if (!mounted) return;
      ref.read(navIndexProvider.notifier).set(3);
      context.go('/');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('暂时无法直达客服，已打开消息页')),
      );
    }
  }

  Future<void> _checkUpdate() async {
    if (_checkingUpdate) return;
    setState(() => _checkingUpdate = true);
    try {
      final update = await const AppUpdateService().check();
      if (!mounted) return;
      if (update == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已是最新版本')),
        );
        return;
      }
      await showAppUpdateDialog(context: context, update: update);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('检查更新失败：$e')),
      );
    } finally {
      if (mounted) setState(() => _checkingUpdate = false);
    }
  }

  Future<void> _sync() async {
    if (_syncing) return;
    setState(() => _syncing = true);
    HapticFeedback.lightImpact();
    try {
      await ref.read(syncControllerProvider.notifier).runSync(force: true);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已同步到云端')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('同步失败：$e')),
      );
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('退出登录'),
        content: const Text('确定退出当前账号？本地数据仍保留。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('退出', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await ref.read(authControllerProvider.notifier).logout();
    if (!mounted) return;
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/');
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final signedIn = auth.signedIn;

    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          _Section(
            title: '读经与体验',
            children: [
              _NavRow(
                title: '外观',
                hint: '主题与读经页样式',
                onTap: () => context.push('/profile/appearance'),
              ),
              _NavRow(
                title: '提醒与勿扰',
                hint: '每日读经提醒 · 读经勿扰',
                onTap: () => context.push('/profile/reminders'),
              ),
              _NavRow(
                title: '离线下载',
                hint: '译本与音频包',
                onTap: () => showOfflineDownloadSheet(context, ref),
              ),
              _NavRow(
                title: '知识库',
                hint: '小爱检索范围',
                onTap: () => context.push('/knowledge-bases'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _Section(
            title: '支持与关于',
            children: [
              _NavRow(
                title: '帮助与反馈',
                hint: '联系客服',
                onTap: () => unawaited(_openSupport()),
              ),
              _NavRow(
                title: '数据来源与许可',
                hint: '经文与资料出处',
                onTap: () =>
                    openOverlayH5(context, '/profile/licenses', title: '许可'),
              ),
              _NavRow(
                title: _checkingUpdate ? '正在检查…' : '检查更新',
                hint: _versionLabel ?? '…',
                onTap: _checkingUpdate ? null : () => unawaited(_checkUpdate()),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _Section(
            title: '数据',
            children: [
              _NavRow(
                title: _syncing ? '同步中…' : '同步到云端',
                hint: signedIn ? '上传本地进度与想法' : '登录后可同步',
                onTap:
                    !signedIn || _syncing ? null : () => unawaited(_sync()),
              ),
              if (signedIn)
                _NavRow(
                  title: '退出登录',
                  danger: true,
                  onTap: () => unawaited(_logout()),
                )
              else
                _NavRow(
                  title: '登录 / 在其他设备恢复',
                  hint: '手机号或用户 ID',
                  onTap: () => openOverlayH5(context, '/login', title: '登录'),
                ),
            ],
          ),
          const SizedBox(height: 16),
          _Section(
            title: '账号',
            children: [
              _NavRow(
                title: '账号与安全',
                hint: '密码、手机号、设备',
                // 叠层 H5 仍加载 Web 设置页（账号表单）；原生壳只覆盖主路径
                onTap: () => openOverlayH5(
                  context,
                  '/profile/settings',
                  title: '账号与安全',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.inkFaint,
            ),
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.line),
          ),
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0)
                  const Divider(height: 1, indent: 16, endIndent: 16),
                children[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _NavRow extends StatelessWidget {
  const _NavRow({
    required this.title,
    this.hint,
    this.onTap,
    this.danger = false,
  });

  final String title;
  final String? hint;
  final VoidCallback? onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return ListTile(
      enabled: enabled,
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          color: danger ? Colors.red.shade700 : AppColors.ink,
        ),
      ),
      subtitle: hint == null
          ? null
          : Text(
              hint!,
              style: const TextStyle(fontSize: 12, color: AppColors.inkFaint),
            ),
      trailing: danger
          ? null
          : const Icon(Icons.chevron_right, color: AppColors.inkFaint),
      onTap: onTap,
    );
  }
}
